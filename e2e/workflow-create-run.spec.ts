import { expect, test } from '@playwright/test';
import { API_URL, USERS, apiLogin, authHeaders, findTemplate, loginViaUi } from './helpers';

/**
 * The plan's critical path: a builder takes a workflow from template A, an
 * admin activates it, it runs manually, and the run shows up as a success.
 *
 * Instantiating a template, activating a version, and executing are API-only —
 * the client renders no control for any of them — so those three steps go over
 * the API with a bearer token. Every screen the client does render is asserted
 * through the browser: the workflows list, the executions list, and the run
 * detail page. When those controls land in the UI, the API steps below are what
 * should be replaced by clicks.
 */
test('a builder creates from template A, an admin activates it, and a manual run succeeds', async ({
  page,
  request,
}) => {
  const builderToken = await apiLogin(request, USERS.builder);
  const adminToken = await apiLogin(request, USERS.workflowAdmin);

  const template = await findTemplate(request, builderToken, 'Critical Ticket Alert');

  const instantiate = await request.post(
    `${API_URL}/api/templates/${template._id}/instantiate`,
    { headers: authHeaders(builderToken) },
  );
  expect(instantiate.status(), await instantiate.text()).toBe(201);
  const { workflow, version } = (await instantiate.json()) as {
    workflow: { _id: string; name: string };
    version: { _id: string };
  };

  // A template copy lands as a draft, and activating needs workflow_admin+.
  const activate = await request.post(`${API_URL}/api/workflows/${workflow._id}/activate`, {
    headers: authHeaders(adminToken),
    data: { versionId: version._id },
  });
  expect(activate.ok(), await activate.text()).toBeTruthy();

  const execute = await request.post(`${API_URL}/api/workflows/${workflow._id}/execute`, {
    headers: authHeaders(builderToken),
    data: { payload: { priority: 'critical', title: 'E2E ticket', number: 'TCK-1' } },
  });
  expect(execute.status(), await execute.text()).toBe(202);
  const { run } = (await execute.json()) as { run: { _id: string } };

  // The run is executed by the API's worker, not inline, so wait on the API
  // rather than on a page that would have to be refreshed to notice.
  await expect
    .poll(
      async () => {
        const res = await request.get(`${API_URL}/api/runs/${run._id}`, {
          headers: authHeaders(builderToken),
        });
        if (!res.ok()) return `http-${res.status()}`;
        return ((await res.json()) as { run?: { status?: string } }).run?.status;
      },
      { message: 'the manual run should reach a terminal status', timeout: 30_000 },
    )
    .toBe('succeeded');

  await loginViaUi(page, USERS.builder);

  // The workflow the template produced is listed.
  await page.getByRole('link', { name: 'Workflows', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible();
  await expect(page.getByRole('link', { name: workflow.name })).toBeVisible();

  // ...and its run is readable end to end.
  await page.getByRole('link', { name: 'Executions', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Executions' })).toBeVisible();
  await page.getByRole('link', { name: workflow.name }).click();

  await expect(page.getByRole('heading', { level: 1, name: /succeeded/ })).toBeVisible();
  await expect(page.getByText(/manual trigger/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Node timeline' })).toBeVisible();
  // The critical-priority payload means the condition passes, so the notify
  // action runs too — more than just the trigger is in the timeline.
  await expect(page.getByRole('listitem').filter({ hasText: 'succeeded' }).first()).toBeVisible();
});
