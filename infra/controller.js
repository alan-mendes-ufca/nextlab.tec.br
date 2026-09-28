import * as cookie from "cookie";

import {
  MethodNotAllowedError,
  InternalServerError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "./errors.js";
import session from "models/session.js";
import user from "models/user.js";
import authorization from "models/authorization.js";
import validateRequest from "models/validateRequest.js";

function onNoMatchHandler(request, response) {
  const publicErrorObject = new MethodNotAllowedError();
  response.status(publicErrorObject.statusCode).json(publicErrorObject);
}

async function onErrorHandler(error, request, response) {
  if (
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof ForbiddenError
  ) {
    return response.status(error.statusCode).json(error);
  }

  if (error instanceof UnauthorizedError) {
    clearSessionCookie(response);
    return response.status(error.statusCode).json(error);
  }

  const publicErrorObject = new InternalServerError({
    cause: error,
  });
  console.log("\n Erro dentro do catch do next-connect");
  console.error(publicErrorObject);
  return response.status(publicErrorObject.statusCode).json(publicErrorObject);
}

function setSessionCookie(sessionToken, response) {
  const setCookie = cookie.serialize("session_token", sessionToken, {
    path: "/",
    maxAge: session.EXPIRATION_IN_MILLISECONDS / 1000,
    secure: true,
    httpOnly: true,
  });
  response.setHeader("Set-Cookie", setCookie);
}

function clearSessionCookie(response) {
  const setCookie = cookie.serialize("session_token", "invalid", {
    path: "/",
    maxAge: -1,
    secure: true,
    httpOnly: true,
  });
  response.setHeader("Set-Cookie", setCookie);
}

async function injectAnonymousOrUser(request, response, next) {
  if (request.cookies?.session_token) await injectAuthenticatedUser(request);
  else await injectAnonymousUser(request);
  return next();

  async function injectAuthenticatedUser(request) {
    const cleanCookieValues = validateRequest(request.cookies, {
      session_token: "required",
    });
    request.cookies = cleanCookieValues;

    const sessionToken = request.cookies.session_token;
    const sessionObject = await session.findOneValidByToken(sessionToken);
    const userObject = await user.findOneById(sessionObject.user_id);

    request.context = {
      ...request.context,
      user: userObject,
    };
  }

  async function injectAnonymousUser(request) {
    const anonymousUserObject = {
      features: [
        "read:activation_token",
        "create:session",
        "create:user",
        "read:status",
      ],
    };

    request.context = {
      ...request.context,
      user: anonymousUserObject,
    };
  }
}

function canRequest(feature) {
  return function canRequestMiddleware(request, response, next) {
    const userTryingToRequest = request.context.user;

    if (authorization.can(userTryingToRequest, feature)) return next();

    throw new ForbiddenError({
      message: "Você não possui permissão para executar esta ação.",
      action: `Verifique se o seu usuário possui a feature '${feature}'`,
    });
  };
}

const controller = {
  errorHandlers: {
    onNoMatch: onNoMatchHandler,
    onError: onErrorHandler,
  },
  setSessionCookie,
  clearSessionCookie,
  injectAnonymousOrUser,
  canRequest,
};

export default controller;
