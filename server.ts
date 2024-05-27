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

// ::: Parse command line parameters (starting from #2, first two are system reserved) :::
const srvFolder = process.argv[2];
const port = process.argv[3] || 4001;
const srvEnv = process.argv[4];
const swaggerRegen = process.argv[5];
const env = new Env();
env.Name = (srvEnv === 'local'?  "local": srvEnv);

const mainDir = process.env.X_PROJECTS_PATH || "E://dev/_Projects";
dotenv.config();
// ::: Read package info :::
const packageJson = FilesHelper.getPackageJson(srvFolder);
const namesHelper = new NamesHelper(packageJson.project, env);

// ::: Environment variables :::
let envVars: any = {};
// ::: Generate default env vars :::
envVars.DB_NAME = namesHelper.dbName(); //`${packageJson.project}-${env.Name}`;
envVars.DB_TABLE = packageJson.main_entity;
envVars.ENV = env.Name;
envVars.REGION = env.Region;
envVars.BUCKET = Env.BucketName(env);
envVars.BUCKET_PATH = namesHelper.bucketPath(); //`${UploadFolder}/${packageJson.project}/${env.Name}`;
envVars.DB_USER = process.env.MONGO_USER ?? `admin`;
envVars.DB_PASS = process.env.MONGO_PASS ?? `123123`;
envVars.AUDIENCE = process.env.AUDIENCE ?? namesHelper.serviceApiName(packageJson.name); //`${packageJson.project}-${packageJson.name}_api_${env.Name}`;

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
	const swaggerGen = new SwaggerGenerator(packageJson, path.join(srvFolder, Consts.defaultModelsDir) );
	const swaggerSpec = swaggerGen.Generate();

	fs.writeFileSync(swaggerJson, JSON.stringify(swaggerSpec, null, 2));
	console.log(`Swagger JSON generated in ${swaggerJson}`);
}
// ::: import swagger file from service's folder :::
const openApiJson = require(swaggerJson);
openApiJson.servers.unshift({ url: `http://localhost:${port}` }); // add local server to enable local runs from Swagger UI

// ::: generate basic API backend based on included swagger file :::
const api = new OpenAPIBackend({ definition: openApiJson });
// ::: extract operations names :::
const operationNames: OperationDef[] = Operation.extractOperations(openApiJson);

// ::: register operations extracted from swagger :::
const registerApi = {};
operationNames.forEach((operation: OperationDef) => {
	registerApi[operation.Name] = async (context: Context, request: Request, res: Response, data: any) => {
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

const mainUrl = `http://localhost:${port}`;
const mainUrlSwagger = `http://localhost:${port}/api-docs`;
server.listen(port, () => {
	console.log(
		"::: Middleware API for AWS Lambda microservice ::::::::::::::::::::::::: Oxymoron Tech ::: 2024 :::"
	);
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