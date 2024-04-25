import type { Context, Request } from "openapi-backend";
import merge from "deepmerge";
import * as apiRequestEmpty from "./API_Event_empty.json";
import * as apiAutherEmpty from "./API_Auther_Event_empty.json";
import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters, APIGatewayRequestAuthorizerEvent, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

export class Path {
    private parts: string[];

    public Parts(): string[] {
        return this.parts;
    }
    public Part(position: number) {
        return (this.parts && this.parts.length > position - 1) ? this.parts[position - 1] : null;
    }

    private pathParams = null;
    public get PathParams() {
        return this.pathParams;
    }

    private hasPathParam: boolean;
    public get HasPathParam(): boolean {
        return this.hasPathParam;
    }

    // constructor(private event: APIGatewayProxyEvent) {
    //     this.Parse(event.resource, event.path);
    // }
    private partsRes: string[];
    private PartRes(position: number) {
        return (this.partsRes && this.partsRes.length > position - 1) ? this.partsRes[position - 1] : null;
    }

    public Parse(eventResource: string, eventPath: string) {
        this.partsRes = eventResource.replace(/^\/+|\/+$/g, '').split('/');
        this.parts = eventPath.replace(/^\/+|\/+$/g, '').split('/');
        const idStr = '{id}'
        if (this.partsRes.includes(idStr)) {
            this.hasPathParam = true;
            const resName = 'id';
            const idIndex = this.partsRes.findIndex(r => r === idStr);
            this.pathParams = { [resName]: this.Part(idIndex + 1) };
        }
        // this.hasPathParam = this.PartRes(2) === '{id}'; // this.eventResource.indexOf('{id}') >= 0;
        // if (this.hasPathParam) this.pathParams = { [this.PartRes(2).replace(/{|}/g, '')]: this.Part(2) };
    }
}

export class Operation {
    private parts: string[];
    public Parts(): string[] {
        return this.parts;
    }

    public get HasClassName(): boolean {
        return this.parts.length > 1;
    }

    public get GetClassName(): string {
        return this.HasClassName ? this.parts[0] : "";
    }
    public get GetMethodName(): string {
        return this.HasClassName ? this.parts[1] : this.parts[0];
    }

    constructor(private operationName: string) {
        this.parts = operationName.split('.');
    }
    
    public static extractOperations(openApiJson: any) {
        const operations: OperationDef[] = [];

        for (const path in openApiJson.paths) {
            const pathObj = openApiJson.paths[path];
            for (const method in pathObj) {
                const operation = pathObj[method];
                if (operation.operationId) {
                    operations.push({
                        Name: operation.operationId,
                        Path: path,
                        Method: method,
                        IsAuth: operation.security && operation.security.length > 0
                    });
                }
            }
        }

        console.log('Operations:', operations);
        return operations;
    }
}

export interface OperationDef {
    Name: string;
    Path: string;
    Method: string;
    IsAuth: boolean;
}

export const getAwsAutherEvent = (proxyEvent: APIGatewayProxyEvent): APIGatewayRequestAuthorizerEvent => {
    const authorizerEvent = merge(apiAutherEmpty, 
        {
            methodArn: proxyEvent.requestContext.identity.caller,
            resource: proxyEvent.resource,
            path: proxyEvent.path,
            httpMethod: proxyEvent.httpMethod,
            headers: proxyEvent.headers,
            queryStringParameters: proxyEvent.queryStringParameters,
            pathParameters: proxyEvent.pathParameters,
            stageVariables: proxyEvent.stageVariables,
            requestContext: proxyEvent.requestContext as any,
        }
    ) as APIGatewayRequestAuthorizerEvent;
     
    return authorizerEvent;
}

/**
 * API standard request convertor to AWS API Gateway event
 * @param request standard api request paramter
 * @param context standard api context paramter
 */
export const getAwsRequestEvent = (request: Request, context: Context): APIGatewayProxyEvent => {
    const apiRequestAws = merge(apiRequestEmpty, {}) as APIGatewayProxyEvent;
    for (const [key, value] of Object.entries(request.headers)) {
        apiRequestAws.headers[key] = value.toString();
    }
    apiRequestAws.httpMethod = request.method;

    apiRequestAws.path = request.path;
    const pathParts = new Path();
    pathParts.Parse(context.operation.path, request.path);
    apiRequestAws.resource = context.operation.path;
    apiRequestAws.pathParameters = pathParts.PathParams;

    apiRequestAws.requestContext["operationName"] = context.operation.operationId;

    apiRequestAws.queryStringParameters = request.query as APIGatewayProxyEventQueryStringParameters;

    apiRequestAws.body = JSON.stringify(request.body);
    return apiRequestAws;
};
