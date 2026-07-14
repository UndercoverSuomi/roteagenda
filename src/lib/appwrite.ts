import { Account, Client, Databases, Functions, Storage } from "appwrite";
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
} from "@/lib/appwrite-config";

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);
const functions = new Functions(client);

export { account, client, databases, functions, storage };
