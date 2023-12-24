import express, { Response } from 'express';
import { OpenAPIBackend } from 'openapi-backend';
import cors from "cors";
import type { Context, Request } from 'openapi-backend';
import swaggerUi from 'swagger-ui-express';

import path from 'path';
import merge from 'deepmerge';
import * as apiRequestEmpty from './API_Event_empty.json';
import { Operation, Path } from './api_path';
import { SwaggerExport } from './swagger_gen';

// ::: Parse command line parameters (starting from #2, first two are system reserved) :::
const srvFolder = process.argv[2];
const port = process.argv[3] || 4001;
const srvEnv = process.argv[4];
const swaggerRegen = process.argv[5];

// ::: import requered environment variables :::
require('./dotenv_apply').load(srvEnv, srvFolder); // load env

// ::: import service's source code ::: 
const handlerPath = path.join(srvFolder, 'src/index');
const handlerModule = require(handlerPath);

if (swaggerRegen) {
    const exp = new SwaggerExport(srvFolder);
    const resp = exp.Generate();
    console.log(resp);
}
// ::: import swagger file from service's folder :::
const openApiFilePath = path.join(srvFolder, 'swagger', 'oas30_gen.json'); 
const openApiJson = require(openApiFilePath); 
openApiJson.servers.unshift({url: `http://localhost:${port}`}); // add local server to enable local runs from UI

// ::: generate basic API backend based on included swagger file ::: 
const api = new OpenAPIBackend({ definition: openApiJson });
// ::: extract operations names :::
const operationNames: string[] = Operation.extractOperations(openApiJson);

// ::: register operations extracted from swagger ::: 
const registerApi = {};
operationNames.forEach((operationName: string) => {
    registerApi[operationName] = async (context: Context, request: Request, res: Response) => {
        try {
            const response = await awsHandler(getAwsRequestEvent(request, context));
            res.status(response.statusCode).json(JSON.parse(response.body));
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// ::: call service's root handler :::
const awsHandler = async (event) => {
    const resp = await handlerModule.handler(event);
    return resp;
}

api.register(registerApi);
api.init();

const server = express();
server.use(cors());
server.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiJson));
server.use(express.json());
server.use((req, res) => {
    api.handleRequest(req as Request, req, res);
});

server.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
    console.log(`Swagger UI on http://localhost:${port}/api-docs`);
    console.log(":::::::::::::::::::::::::::::::: YOU CAN START TO USE THE SERVER ::::::::::::::::::::::::::::::::::::");
});

/**
 * API standard request convertor to AWS API Gateway event
 * @param request standard api request paramter
 * @param context standard api context paramter
 */
const getAwsRequestEvent = (request: Request, context: Context) => {
    const apiRequestAws = merge(apiRequestEmpty, {});

    apiRequestAws.httpMethod = request.method;
    // apiRequestAws.headers = req.headers;
    apiRequestAws.path = request.path;

    const pathParts = new Path();
    pathParts.Parse(context.operation.path, request.path);
    apiRequestAws.resource = context.operation.path;
    apiRequestAws.pathParameters = pathParts.PathParams;

    apiRequestAws.queryStringParameters = request.query;

    apiRequestAws.body = JSON.stringify(request.body);
    return apiRequestAws;
}