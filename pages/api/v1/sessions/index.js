import { createRouter } from "next-connect";
import controller from "../../../../infra/controller.js";
import authentication from "models/authentication.js";
import session from "models/session.js";
import authorization from "models/authorization.js";
import validateRequest from "models/validateRequest.js";
import { ForbiddenError } from "infra/errors.js";

function postValidationHandler(request, response, next) {
  const cleanValues = validateRequest(request.body, {
    email: "required",
    password: "required",
  });

  request.body = cleanValues;

  return next();
}

async function postHandler(request, response) {
  const userTryingToPost = request.context.user;
  if (
    !authorization.can(userTryingToPost, "create:session", userTryingToPost.id)
  ) {
    throw new ForbiddenError({
      message: "Não é possível logar uma conta enquanto você está logado.",
      action:
        "Para logar em uma nova conta, primeiro você precisa sair da conta atual, ou pode acessar a página numa janela anônima.",
    });
  }

  const userInputValues = request.body;
  const authenticatedUser = await authentication.getUser(
    userInputValues.email,
    userInputValues.password,
  );

  if (!authorization.can(authenticatedUser, "create:session")) {
    throw new ForbiddenError({
      message: "Você não possui permissão para fazer login.",
      action: "Contate o suporte caso você acredite que isto seja um erro.",
    });
  }

  const newSession = await session.create(authenticatedUser.id);

  controller.setSessionCookie(newSession.token, response);

  const secureOutputValues = authorization.filterOutput(
    authenticatedUser,
    "read:session",
    newSession,
  );
  return response.status(201).json(secureOutputValues);
}

async function deleteHandler(request, response) {
  const userTryingToDelete = request.context.user;

  const providedToken = request.cookies.session_token;
  const foundSession = await session.findOneValidByToken(providedToken);
  const expiredSessionObject = await session.expireById(foundSession.id);

  controller.clearSessionCookie(response);

  const secureOutputValues = authorization.filterOutput(
    userTryingToDelete,
    "read:session",
    expiredSessionObject,
  );
  return response.status(200).json(secureOutputValues);
}

export default createRouter()
  .use(controller.injectAnonymousOrUser)
  .post(
    postValidationHandler,
    controller.canRequest("create:session"),
    postHandler,
  )
  .delete(deleteHandler)
  .handler(controller.errorHandlers);
