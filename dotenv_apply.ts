import * as dotenv from 'dotenv';
import path from 'path';
import { config as AWSConfig } from 'aws-sdk';

export const load = (envName: string = 'dev', rootFolder: string) => {
    // const p = path.resolve(__dirname, `../../.env${envNameExt}`);
    const p = path.join(rootFolder, `.env.${envName}`);
    dotenv.config({path: p});

    AWSConfig.update({ region: process.env.REGION });
};