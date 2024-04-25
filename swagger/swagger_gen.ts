import fs from 'fs';
import path from 'path';
import { ModelExport, ModelRequest } from './model_exp';
import swaggerJSDoc from 'swagger-jsdoc';

export enum AuthTypes {
    Auth0 = 'Auth0'
}

const awsExt = {
    "httpMethod": "POST",
    "uri": "arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${region}:${account}:function:${lambda_name}/invocations",
    "responses": {
        "default": {
            "statusCode": "200"
        }
    },
    "passthroughBehavior": "when_no_match",
    "contentHandling": "CONVERT_TO_TEXT",
    "type": "aws_proxy"
}

export class SwaggerExport {
    public readonly swaggerFolderName = 'swagger';
    private packageJson: any;

    public static IsStringInEnum = (input: string, enumObj: Record<string, string>): boolean => Object.values(enumObj).includes(input);

    constructor(private destinationDir: string) {
        const packageJsonPath = path.join(destinationDir, 'package.json');
        const jsonStr = fs.readFileSync(packageJsonPath);
        this.packageJson = JSON.parse(jsonStr.toString());
    }
    public Generate() {
        const swaggerOptions = {
            definition: {
                openapi: '3.0.0',
                info: {
                    title: this.packageJson.name,
                    version: this.packageJson.version,
                    description: this.packageJson.description
                }
            },
            apis: [],
        };
        const swaggerSpec = swaggerJSDoc(swaggerOptions);
        swaggerSpec["servers"] = []; // add empty servers list to use it in API Local Proxy [ExpressBackend]
        if (!swaggerSpec["components"]["schemas"])
            swaggerSpec["components"]["schemas"] = {
                "Empty": {
                    "title": "Empty Schema",
                    "type": "object"
                }
            };

        // Models schemas generation
        const paramsModel = new ModelRequest(null);
        paramsModel.destinationDir = this.destinationDir;
        const modelExport = new ModelExport(paramsModel);
        const modelSchemas = modelExport.GenerateAll();
        modelSchemas.forEach((modelSchema) => {
            swaggerSpec["components"]["schemas"][modelSchema?.title] = modelSchema;
        });

        // CRUD paths generation
        const mainEntity: string = this.packageJson.main_entity;
        const mainPath = {
            "get": {
                "operationId": "get_all",
                "responses": {
                    "200": {
                        "description": "200 response",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": `#/components/schemas/${mainEntity}List`
                                }
                            }
                        }
                    }
                }
            },
            "post": {
                "operationId": "create",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": `#/components/schemas/${mainEntity}`
                            }
                        }
                    },
                    "required": true
                },
                "responses": {
                    "200": {
                        "description": "200 response",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/Empty"
                                }
                            }
                        }
                    }
                }
            }
        };
        const idPath = {
            "get": {
                "operationId": "get",
                "parameters": [{
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "string"
                    }
                }],
                "responses": {
                    "200": {
                        "description": "200 response",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": `#/components/schemas/${mainEntity}`
                                }
                            }
                        }
                    }
                }
            },
            "put": {
                "operationId": "update",
                "parameters": [{
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "string"
                    }
                }],
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": `#/components/schemas/${mainEntity}`
                            }
                        }
                    },
                    "required": true
                },
                "responses": {
                    "200": {
                        "description": "200 response",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/Empty"
                                }
                            }
                        }
                    }
                }
            },
            "delete": {
                "operationId": "delete",
                "parameters": [{
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "string"
                    }
                }],
                "responses": {
                    "200": {
                        "description": "200 response",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/Empty"
                                }
                            }
                        }
                    }
                }
            }
        };

        // generate params for get_all
        const searchParams = modelSchemas.find((el) => el.title == "SearchParams");
        if (searchParams) {
            const params: any[] = [];
            const props = searchParams.properties;
            Object.keys(props).forEach((key) => {
                const param = {
                    "name": key,
                    "in": "query",
                    "required": searchParams.required?.includes(key),
                    "schema": {
                        "type": props[key].type
                    }
                };
                params.push(param);
            });
            // add params to get_all
            mainPath["get"]["parameters"] = params;
            // add QS validator
            swaggerSpec["x-amazon-apigateway-request-validators"] = {
                "Validate query string parameters and headers": {
                    "validateRequestParameters": true,
                    "validateRequestBody": false
                }
            };
        }

        Object.values(mainPath).forEach((el) => {
            el["x-amazon-apigateway-integration"] = awsExt;
        });
        Object.values(idPath).forEach((el) => {
            el["x-amazon-apigateway-integration"] = awsExt;
        });

        if (this.packageJson.auth_type) {
            if (SwaggerExport.IsStringInEnum(this.packageJson.auth_type, AuthTypes)) {
                Object.values(mainPath).forEach((el) => {
                    el["security"] = [{ [this.packageJson.auth_type]: [] }];
                });
                Object.values(idPath).forEach((el) => {
                    el["security"] = [{ [this.packageJson.auth_type]: [] }];
                });

                swaggerSpec["components"]["securitySchemes"] = {
                    "Auth0": {
                        "type": "apiKey",
                        "name": "Authorization",
                        "in": "header",
                        "x-amazon-apigateway-authtype": "custom",
                        "x-amazon-apigateway-authorizer": {
                            "type": "token",
                            "authorizerUri": "arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${region}:${account}:function:${auth_name}/invocations",
                            "authorizerResultTtlInSeconds": 300
                        }
                    }
                }
            } else {
                throw new Error("Auth type is not recognized");
            }
        }

        swaggerSpec["paths"][`/${mainEntity.toLowerCase()}`] = mainPath;
        swaggerSpec["paths"][`/${mainEntity.toLowerCase()}/{id}`] = idPath;

        const fileNameSwagger = path.join(this.destinationDir, this.swaggerFolderName, "oas30_templ.json");
        fs.writeFileSync(fileNameSwagger, JSON.stringify(swaggerSpec));
        return `Swagger JSON generated in ${fileNameSwagger}`;
    }
}