import fs from 'fs';
import path from 'path';
import * as TJS from 'typescript-json-schema';

// optionally pass argument to schema generator
const settings: TJS.PartialArgs = {
    required: true,
    aliasRef: true,
    ref: true,
    ignoreErrors: true
};

// optionally pass ts compiler options
const compilerOptions: TJS.CompilerOptions = {
    strictNullChecks: true,
};

export class ModelRequest {
    private readonly defaultModelsDir = 'src/models';
    private readonly defaultExportsDir = 'export';
    private readonly defaultGenerateDir = 'generated'; //path.join(this.defaultModelsDir, 'generated');

    public destinationDir!: string;
    public modelsDir = this.defaultModelsDir;
    public exportDir = this.defaultExportsDir;
    public generateDir = this.defaultGenerateDir;
    public model!: string;

    public region: string = 'eu-west-1';
    public apiId!: string;
    public stageName!: string;

    constructor(data: ModelRequest | string | null) {
        if (data) {
            if (typeof data !== 'object') data = JSON.parse(data);
            Object.assign(this, data);
        }
    }

    public get ModelsPath(): string {
        return path.join(this.destinationDir, this.modelsDir);
    }
    public get ExportPath(): string {
        return path.join(this.destinationDir, this.exportDir);
    }
    public get GeneratePath(): string {
        return path.join(this.destinationDir, this.generateDir, this.exportDir);
    }
    public get GenerateTsPath(): string {
        return path.join(this.destinationDir, this.generateDir, 'models');
    }

    public fileName(modelName: string): string {
        return `${modelName}.json`;
    }
    public fileNameTS(modelName: string): string {
        return `${modelName}.ts`;
    }
}
export class ModelExport {
    private readonly baseUrlRestApi = 'https://apigateway.amazonaws.com/restapis';

    constructor(private params: ModelRequest) {
        // ensure export dir exists 
        const destinationFolder = params.ExportPath;
        if (!fs.existsSync(destinationFolder)) fs.mkdirSync(destinationFolder);
    }

    public Generate(modelName: string) {
        const program = TJS.getProgramFromFiles(
            [path.resolve(`${this.params.ModelsPath}/${modelName}.ts`)],
            compilerOptions
        );

        const schemaObj = TJS.generateSchema(program, modelName, settings);
        if (schemaObj) {
            delete schemaObj.definitions;
            delete schemaObj["$schema"];
            schemaObj.title = modelName;
            if (schemaObj.properties) {
                const obj = schemaObj.properties as Object;
                Object.keys(obj).forEach((key) => {
                    const prop = obj[key];
                    this.replaceDefinition(prop);
                });
            } else { // fallback for a list of models
                this.replaceDefinition(schemaObj);
            }
        }
        return schemaObj;
    }
    private replaceDefinition(prop: any) {
        if (prop.type === 'array') {
            const ref = prop.items.$ref.replace('#/definitions/', '');
            prop.items.$ref = `${this.getRef()}/${ref}`;
        } else if (prop.$ref) {
            prop.$ref = prop.$ref.replace('#/definitions',`${this.getRef()}`);
            // prop.type = 'object'
        }
    }
    private getRef(): string {
        let refLink = "";
        if (this.params.apiId) refLink = `${this.baseUrlRestApi}/${this.params.apiId}/models`;
        else refLink = "#/components/schemas";
        return refLink;
    }

    public GenerateAll(): any[] {
        let resp: any[] = [];
        fs.readdirSync(this.params.ModelsPath).forEach((file) => {
            const schema = this.Generate(file.replace('.ts', ''));
            resp.push(schema!);
        });
        return resp;
    }
}