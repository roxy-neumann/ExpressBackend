import * as dotenv from 'dotenv';
import path from 'path';

export const load = (envName: string = 'dev', rootFolder: string): any => {
    const p = path.join(rootFolder, `.env.${envName}`);
    const resp = dotenv.config({path: p});
    return resp;
};