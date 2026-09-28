import { createRouter } from "next-connect";
import controller from "../../../../infra/controller.js";
import user from "../../../../models/user.js";
import activation from "../../../../models/activation.js";
import authorization from "models/authorization.js";
import validateRequest from "models/validateRequest.js";

function postValidationHandler(request, response, next) {
  const cleanValues = validateRequest(request.body, {
    username: "required",
    email: "required",
    password: "required",
  });

  request.body = cleanValues;

  return next();
}

async function postHandler(request, response) {
  const userTryingToPost = request.context.user;

  const userInputValues = request.body;
  const newUser = await user.create(userInputValues);

  const activationToken = await activation.create(newUser.id);
  await activation.sendEmailToUser(newUser, activationToken);

  const secureOutputValues = authorization.filterOutput(
    userTryingToPost,
    "read:user",
    newUser,
  );

  return response.status(201).json(secureOutputValues);
}

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .post(
    postValidationHandler,
    controller.canRequest("create:user"),
    postHandler,
  )
  .handler(controller.errorHandlers);
