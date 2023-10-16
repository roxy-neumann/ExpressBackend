import * as dotenv from 'dotenv';
import path from 'path';

export const load = (envName: string = 'dev', rootFolder: string) => {
    const p = path.join(rootFolder, `.env.${envName}`);
    dotenv.config({path: p});
};