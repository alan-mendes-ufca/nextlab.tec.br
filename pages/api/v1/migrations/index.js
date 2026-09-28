import { createRouter } from "next-connect";
import controller from "../../../../infra/controller";
import migrator from "../../../../models/migrator.js";
import authorization from "models/authorization";

const router = createRouter();

router.use(controller.injectAnonymousOrUser);
router.get(controller.canRequest("read:migrations"), getHandler);
router.post(controller.canRequest("create:migrations"), postHandler);

export default router.handler(controller.errorHandlers);

async function getHandler(request, response) {
  const userTryingToGet = request.context.user;
  const pendingMigrations = (await migrator.listPendingMigrations())
    .pendingMigrations;

  const secureOutputValues = authorization.filterOutput(
    userTryingToGet,
    "read:migrations",
    pendingMigrations,
  );

  return response.status(200).json(secureOutputValues);
}

async function postHandler(request, response) {
  const userTryingToGet = request.context.user;
  const appliedMigrations = (await migrator.runPendingMigrations())
    .appliedMigrations;

  const secureOutputValues = authorization.filterOutput(
    userTryingToGet,
    "read:migrations",
    appliedMigrations,
  );

  if (appliedMigrations.length > 0) {
    response.status(201).json(secureOutputValues);
  }

  return response.status(200).json(secureOutputValues);
}
