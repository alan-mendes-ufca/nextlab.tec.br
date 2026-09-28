import { createRouter } from "next-connect";
import controller from "../../../../../infra/controller.js";
import user from "../../../../../models/user.js";
import authorization from "models/authorization.js";
import validateRequest from "models/validateRequest.js";
import { ForbiddenError } from "infra/errors.js";

function getValidationHandler(request, response, next) {
  const cleanValues = validateRequest(request.query, {
    username: "required",
  });

  request.query = cleanValues;

  return next();
}

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;
  const username = request.query.username;
  const userFound = await user.findOneByUsername(username);

  const secureOutputValues = authorization.filterOutput(
    userTryingToGet,
    "read:user",
    userFound,
  );

  response.status(200).json(secureOutputValues);
}

function patchValidationHandler(request, response, next) {
  const cleanQueryValues = validateRequest(request.query, {
    username: "required",
  });

  request.query = cleanQueryValues;

  const cleanBodyValues = validateRequest(request.body, {
    username: "optional",
    email: "optional",
    password: "optional",
  });

  request.body = cleanBodyValues;

  return next();
}

async function patchHandler(request, response) {
  const userTryingToPatch = request.context.user;
  const username = request.query.username;
  const userInputValues = request.body;

  const targetUser = await user.findOneByUsername(username);

  if (!authorization.can(userTryingToPatch, "update:user", targetUser)) {
    throw new ForbiddenError({
      message: "Você não tem autorização para alterar outro usuário.",
      action:
        "Verifique se você tem a feature necessária para alterar outros usuários.",
    });
  }

  const updatedUser = await user.update(username, userInputValues);

  const secureOutputValues = authorization.filterOutput(
    userTryingToPatch,
    "read:user",
    updatedUser,
  );

  response.status(200).json(secureOutputValues);
}

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .get(getValidationHandler, getHandler)
  .patch(
    patchValidationHandler,
    controller.canRequest("update:user"),
    patchHandler,
  )
  .handler(controller.errorHandlers);
