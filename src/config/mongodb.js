import { MongoClient, ServerApiVersion } from 'mongodb';
import { env } from '~/config/environment';

// khoi tao 1 doi tuong ban dau
let databaseInstance = null;

// khoi tao ClientInstance de connect
const mongoClientInstance = new MongoClient(env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

export const CONNECT_DB = async () => {
    await mongoClientInstance.connect();

    databaseInstance = mongoClientInstance.db(env.DATABASE_NAME);
};

export const GET_DB = () => {
    if (!databaseInstance) throw new Error('Database not found');
    return databaseInstance;
};

export const CLOSE_DB = async () => {
    await mongoClientInstance.close();
};
