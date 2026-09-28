import retry from "async-retry";
import { faker } from "@faker-js/faker";
import db from "../infra/database.js";
import migrator from "../models/migrator.js";
import user from "../models/user.js";
import session from "../models/session.js";
import activation from "../models/activation.js";
import webserver from "../infra/webserver.js";

const emailHttpUrl = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;

async function waitForAllServices() {
  await waitForWebServer();
  await waitForEmailServer();

  async function waitForWebServer(
    maxRetries = 100,
    // minTimeout = 500,
    maxTimeout = 1000,
  ) {
    return retry(fetchStatusPage, {
      retries: maxRetries,
      // minTimeout: minTimeout,
      maxTimeout: maxTimeout,
      onRetry: (error, attempt) => {
        console.log(
          `Attempt: ${attempt} - Failed to fetch status page: ${error.message}`,
        );
      },
    });

    async function fetchStatusPage() {
      try {
        const response = await fetch(`${webserver.origin}/api/v1/status`);
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      } catch (error) {
        console.error("Não foi possível buscar a páguina de status: ", error);
        throw error;
      }
    }
  }
  async function waitForEmailServer(maxRetries = 100, maxTimeout = 1000) {
    return retry(fetchEmail, {
      retries: maxRetries,
      maxTimeout: maxTimeout,
      onRetry: (error, attempt) => {
        console.log(
          `Attempt: ${attempt} - Failed to fetch email catcher server: ${error.message}`,
        );
      },
    });

    async function fetchEmail() {
      try {
        const response = await fetch(emailHttpUrl);
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      } catch (error) {
        console.error(
          "Não foi possível buscar o servidor do email catcher: ",
          error,
        );
        throw error;
      }
    }
  }
}

async function clearDB() {
  await db.query("DROP schema public cascade; create schema public;");
}

async function runPendingMigrations() {
  await migrator.runPendingMigrations();
}

async function totalAppliedMigrations() {
  return (await db.query('SELECT COUNT(*) FROM  "public"."pg-migrations";'))
    .rows[0].count;
}

async function createUser(userObject) {
  const createdUser = await user.create({
    username:
      userObject?.username || faker.internet.username().replace(/[_.-]/g, ""),
    email: userObject?.email || faker.internet.email(),
    password: userObject?.password || "password",
  });
  return createdUser;
}

async function activateUser(inactivaUser) {
  return await activation.activateUserByUserId(inactivaUser.id);
}

async function createSession(userObject) {
  return await session.create(userObject.id);
}

async function deleteAllEmails() {
  await fetch(`${emailHttpUrl}/messages`, {
    method: "DELETE",
  });
}

async function getLastEmail() {
  // Esperar o email chegar no MailCatcher
  // eslint-disable-next-line no-undef
  await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 segundo

  const emailListResponse = await fetch(`${emailHttpUrl}/messages`);
  const emailListBody = await emailListResponse.json();
  const lastEmailItem = emailListBody.pop();

  if (!lastEmailItem) return null;

  const emailTextResponse = await fetch(
    `${emailHttpUrl}/messages/${lastEmailItem.id}.plain`,
  );

  const emailTextBody = await emailTextResponse.text();
  lastEmailItem.text = emailTextBody;
  return lastEmailItem;
}

function extractActivationTokenFromEmail(emailBody) {
  const regex = /\/cadastro\/ativar\/([a-zA-Z0-9\-_]+)/;
  const match = emailBody.match(regex);
  return match?.[1];
}

async function addFeaturesToUser(userObject, features) {
  const updatedUser = user.addFeatures(userObject.id, features);
  return updatedUser;
}

async function removeFeaturesOfUser(userObject, features) {
  const updatedUser = user.removeFeatures(userObject.id, features);
  return updatedUser;
}

const orchestrator = {
  waitForAllServices,
  clearDB,
  runPendingMigrations,
  totalAppliedMigrations,
  createUser,
  activateUser,
  createSession,
  deleteAllEmails,
  getLastEmail,
  extractActivationTokenFromEmail,
  addFeaturesToUser,
  removeFeaturesOfUser,
};

export default orchestrator;
