import express, { Response } from 'express';
import path from 'path';
import { OpenAPIBackend } from 'openapi-backend';
import type { Context, Request } from 'openapi-backend';

import merge from 'deepmerge';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as apiRequestEmpty from './API_Event_empty.json';
import { Path } from './api_path';

const srvFolder = process.argv[2];
const openApiFilePath = path.join(srvFolder, 'swagger', 'oas30_aws.json'); //'ReactApp-users-srv_api_dev-dev-oas30.json';
const openApiJson = require(openApiFilePath); //`./${openApiFilePath}`

const srvEnv = process.argv[3];
require('./dotenv_apply').load(srvEnv, srvFolder);

const handlerPath = path.join(srvFolder, 'src/index');
const handlerModule = require(handlerPath);

const api = new OpenAPIBackend({ definition: openApiJson });
const operationNames: string[] = extractOperations(openApiJson);
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
})

const awsHandler = async (event: APIGatewayProxyEvent) => {
    const resp = await handlerModule.handler(event);
    return resp;
}

api.register(registerApi);
api.init();

const app = express();
app.use(express.json());
app.use((req, res) => {
    api.handleRequest(req as Request, req, res);
});

const port = 4001;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

function getAwsRequestEvent(request: Request, context: Context): APIGatewayProxyEvent {
    const apiRequestAws = merge(apiRequestEmpty, {}) as APIGatewayProxyEvent;

    apiRequestAws.httpMethod = request.method;
    // apiRequestAws.headers = req.headers;
    apiRequestAws.path = request.path;

    const pathParts = new Path();
    pathParts.Parse(context.operation.path, request.path);
    apiRequestAws.resource = context.operation.path;
    apiRequestAws.pathParameters = pathParts.PathParams;

    apiRequestAws.body = JSON.stringify(request.body);
    return apiRequestAws;
}

function extractOperations(openApiJson) {
    const operationNames: string[] = [];

    for (const path in openApiJson.paths) {
        const pathObj = openApiJson.paths[path];
        for (const method in pathObj) {
            const operation = pathObj[method];
            if (operation.operationId) {
                operationNames.push(operation.operationId);
            }
        }
    }

    console.log('Operations:', operationNames);
    return operationNames;
}
