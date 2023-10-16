// import { APIGatewayProxyEventPathParameters } from "aws-lambda";

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
        this.hasPathParam = this.PartRes(2) === '{id}'; // this.eventResource.indexOf('{id}') >= 0;
        if (this.hasPathParam) this.pathParams = { [this.PartRes(2).replace(/{|}/g, '')]: this.Part(2) };
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
        return this.HasClassName? this.parts[0]: "";
    }
    public get GetMethodName(): string {
        return this.HasClassName? this.parts[1]: this.parts[0];
    }

    constructor(private operationName: string) {
        this.parts = operationName.split('.');
    }

    public static extractOperations(openApiJson) {
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
}
