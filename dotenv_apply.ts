import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
export const load = (envName: string = 'dev', rootFolder: string): any => {
    const p = path.join(rootFolder, `.env.${envName}`);
    if (fs.existsSync(p)) {
        const resp = dotenv.config({ path: p });
        return resp;
    } else {

    }
};