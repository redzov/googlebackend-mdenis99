import { PrismaClient } from '@prisma/client';
import { createWorkspaceService } from '../services/googleWorkspace.js';

const prisma = new PrismaClient();

async function main() {
  const workspace = await prisma.workspace.findFirst();
  const gwService = await createWorkspaceService(workspace);

  const res = await gwService.admin.users.list({ domain: workspace.domain, maxResults: 50 });
  const users = res.data.users || [];
  console.log('Domain users:', users.length);

  let deleted = 0;
  for (const u of users) {
    if (u.primaryEmail !== workspace.adminEmail && !u.isAdmin) {
      console.log('Deleting:', u.primaryEmail);
      await gwService.admin.users.delete({ userKey: u.primaryEmail });
      deleted++;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  gwService.destroy();
  console.log('Deleted', deleted, 'accounts from Google');

  await prisma.creationLog.deleteMany({});
  await prisma.account.deleteMany({});
  console.log('DB cleaned');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
