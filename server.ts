import express, { Response } from "express";
import { OpenAPIBackend } from "openapi-backend";
import cors from "cors";
import type { Context, Request } from "openapi-backend";
import swaggerUi from "swagger-ui-express";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { Operation, OperationDef, getAwsAutherEvent, getAwsRequestEvent } from "./api_helper";
import { FilesHelper, Env, NamesHelper, SwaggerGenerator, Consts } from "utils-shared";
import https from 'https';

// ::: Parse command line parameters (starting from #2, first two are system reserved) :::
const srvFolder = process.argv[2];
const ip = process.argv[3];
const srvEnv = process.argv[4];
const swaggerRegen = process.argv[5];
const env = new Env();
env.Name = (srvEnv === 'local' ? "local" : srvEnv);

const mainDir = process.env.X_PROJECTS_PATH || "C://dev/_Projects";
dotenv.config();
// ::: Read package info :::
const packageJson = FilesHelper.getPackageJson(srvFolder);
const namesHelper = new NamesHelper(packageJson.project, env);
const domain = namesHelper.serviceDomainName(packageJson.name, '');
// ::: Environment variables :::
let envVars: any = {};
// ::: Generate default env vars :::
envVars.ENV = env.Name;
envVars.REGION = env.Region;
envVars.BUCKET = Env.BucketName(env);
envVars.BUCKET_PATH = namesHelper.bucketPath();

// ::: DB connection details - can be overridden by env vars or .env file :::
envVars.DB_NAME = namesHelper.dbName();
envVars.DB_TABLE = packageJson.main_entity;
envVars.DB_CLUSTER = process.env.MONGO_CLUSTER ?? `elementx.wg7wcp4.mongodb.net`;
envVars.DB_USER = process.env.MONGO_USER ?? `admin`;
envVars.DB_PASS = process.env.MONGO_PASS ?? `123123`;

envVars.AUDIENCE = process.env.AUDIENCE ?? namesHelper.serviceApiName(packageJson.name);
envVars.TOKEN_ISSUER = process.env.TOKEN_ISSUER ?? `${namesHelper.subDomainName()}.eu.auth0.com`;

Object.keys(envVars).forEach((key) => {
	process.env[key] = envVars[key];
});

// ::: if there is a .env file - read it :::
const envPath = path.join(srvFolder, `.env.${env.Name}`);
if (fs.existsSync(envPath)) {
	const env = dotenv.config({ path: envPath });
	envVars = { ...envVars, ...env.parsed };
}
// ::: import service's source code :::
const handlerPath = path.join(srvFolder, "src/index");
const handlerModule = require(handlerPath);
// ::: import auther's source code :::
const autherType = packageJson.auth_type || 'Auth0';
const autherPath = path.join(mainDir, 'Authorizers', autherType, "src/index");
const autherModule = require(autherPath);

const swaggerJson = path.join(srvFolder, Consts.swaggerFolderName, `${Consts.swaggerFile}.json`);
if (swaggerRegen) {
	const swaggerGen = new SwaggerGenerator(packageJson, path.join(srvFolder, Consts.defaultModelsDir));
	const swaggerSpec = swaggerGen.Generate();

	fs.writeFileSync(swaggerJson, JSON.stringify(swaggerSpec, null, 2));
	console.log(`Swagger JSON generated in ${swaggerJson}`);
}
// ::: import swagger file from service's folder :::
const openApiJson = require(swaggerJson);
openApiJson.servers.unshift({ url: `http://${ip}` }); // add local server to enable local runs from Swagger UI

// ::: generate basic API backend based on included swagger file :::
const api = new OpenAPIBackend({ definition: openApiJson });
// ::: extract operations names :::
const operationNames: OperationDef[] = Operation.extractOperations(openApiJson);
console.log('Operations:', operationNames);

// ::: register operations extracted from swagger :::
// ::: lambdaHandlers are stored separately so validationFail can invoke them after filtering :::
const lambdaHandlers: Record<string, (context: Context, request: Request, res: Response, data?: any) => Promise<void>> = {};
operationNames.forEach((operation: OperationDef) => {
	lambdaHandlers[operation.Name] = async (context: Context, request: Request, res: Response, data: any) => {
		try {
			const event = getAwsRequestEvent(request, context);
			if (data && data.length) {
				// Convert rawData to a base64 string
				event.body = data.toString("base64");
				event.isBase64Encoded = true;
			}
			if (operation.IsAuth) {
				const authEvent = getAwsAutherEvent(event);
				authEvent.stageVariables = { DOMAIN: process.env.TOKEN_ISSUER, AUDIENCE: process.env.AUDIENCE };
				const authResp = await autherModule.handler(authEvent);
				console.log("Auth response:", authResp);
				// find in authResp.policyDocument statements 'execute-api:Invoke' and check if it's 'Allow'
				if (authResp.policyDocument.Statement[0].Effect !== "Allow") {
					res.status(401).json({ error: "Unauthorized" });
					return;
				}
				event.requestContext.authorizer = authResp.context;
				event.requestContext.authorizer.principalId = authResp.principalId;
			}
			// ::: call service's root handler :::
			const response = await handlerModule.handler(event);
			if (response.headers.hasOwnProperty("Content-Type") && response.headers["Content-Type"] === "application/xml") {
				res.status(response.statusCode).type("application/xml").send(response.body);
			} else {
				res.status(response.statusCode).json(JSON.parse(response.body));
			}
		} catch (error) {
			console.error(error);
			res.status(500).json({ error: "Internal server error" });
		}
	};
});

// ::: AWS API Gateway validator configs from swagger :::
const awsValidatorConfigs: Record<string, { validateRequestBody: boolean; validateRequestParameters: boolean }> =
	openApiJson["x-amazon-apigateway-request-validators"] || {};

// ::: validationFail mimics AWS API Gateway request validation :::
// ::: Respects x-amazon-apigateway-request-validator per operation — body-only, params-only, or both :::
const registerApi: any = {
	...lambdaHandlers,
	validationFail: async (context: Context, request: Request, res: Response, data: any) => {
		const validatorKey = context.operation?.["x-amazon-apigateway-request-validator"] as string | undefined;
		const validatorCfg = validatorKey ? awsValidatorConfigs[validatorKey] : null;
		const allErrors = (context.validation.errors || []) as any[];

		if (!validatorCfg) {
			// No AWS validator defined for this operation — pass through to Lambda (AWS wouldn't block it)
			const handler = lambdaHandlers[context.operation?.operationId];
			if (handler) 
				return handler(context, request, res, data);

			return res.status(400).json({ error: "Validation failed", details: allErrors });
		}

		// ::: Filter AJV errors to only those AWS would enforce :::
		const relevantErrors = allErrors.filter((err) => {
			const isBodyError = (err.schemaPath as string)?.includes("/requestBody") || (err.instancePath as string)?.startsWith("/requestBody");
			return isBodyError ? validatorCfg.validateRequestBody : validatorCfg.validateRequestParameters;
		});

		if (relevantErrors.length === 0) {
			// Errors are outside this operation's validator scope — pass through to Lambda
			const handler = lambdaHandlers[context.operation?.operationId];
			if (handler) return handler(context, request, res, data);
		}

		console.warn(`[Validation] ${context.operation?.operationId} failed (${validatorKey}):`, relevantErrors);
		res.status(400).json({
			error: "Validation failed",
			details: relevantErrors.map((e) => ({ path: e.instancePath, message: e.message })),
		});
	},
};

api.register(registerApi);
api.init();

const server = express();
server.use(cors());
server.use(express.static("public")); // serve custom CSS
server.use(
	"/api-docs",
	swaggerUi.serve,
	swaggerUi.setup(openApiJson, {
		customSiteTitle: `${packageJson.project} | ${packageJson.name}`,
		customCssUrl: "/swagger-dark.css",
	})
);
server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use(express.raw());
server.use((req, res) => {
	let rawData = [];
	req.on("data", (chunk) => {
		rawData.push(chunk);
	});

	req.on("end", () => {
		if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
			// Combine all chunks into a single buffer
			const combinedData = Buffer.concat(rawData);
			// Continue with handling the request using your API logic
			api.handleRequest(req as Request, req, res, combinedData); // Pass combinedData as needed
		}
	});
	if (!req.headers["content-type"]?.startsWith("multipart/form-data")) {
		api.handleRequest(req as Request, req, res);
	}
});

const options = {
	key: fs.readFileSync(`${mainDir}/_cert/_wildcard.l.test+1-key.pem`),
	cert: fs.readFileSync(`${mainDir}/_cert/_wildcard.l.test+1.pem`)
};

const port = 443;
// const mainUrl = `https://${ip}`;
const mainUrl = `https://${domain}`;
const mainUrlSwagger = `${mainUrl}/api-docs`;

https.createServer(options, server).listen(port, ip, () => {
	// server.listen(port, ip, () => {
	console.log("::: Middleware API for AWS Lambda microservice ::::::::::::::::::::::::: Oxymoron Tech ::: 2024 :::");
	const srvDetails =
		packageJson.project && packageJson.name
			? `for [${packageJson.project} | ${packageJson.name}]`
			: "";
	console.log(`Running API ${srvDetails} at ${srvFolder}`);

	console.log(`Variables of [${env.Name}] environment:`);
	Object.keys(envVars).forEach((key) => console.log(`${key}: ${envVars[key]}`));

	console.log(`Listening on ${mainUrl}`);
	console.log(`Swagger UI on ${mainUrlSwagger}`);
});