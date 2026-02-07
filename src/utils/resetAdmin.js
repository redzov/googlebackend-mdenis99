import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function resetAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin928468';
  const password = process.env.ADMIN_PASSWORD || '74a7eaca-b3ed-423d-9e9a-158d58222ae6';

  console.log('Resetting admin credentials...');

  // Delete all existing admins
  const deleted = await prisma.admin.deleteMany({});
  console.log(`Deleted ${deleted.count} existing admin(s)`);

  // Create new admin with specified credentials
  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.admin.create({
    data: {
      username,
      password: hashedPassword
    }
  });

  console.log(`Admin created successfully!`);
  console.log(`Username: ${username}`);
  console.log(`Password: ${password.substring(0, 8)}...`);

  await prisma.$disconnect();
}

resetAdmin().catch(async (e) => {
  console.error('Error resetting admin:', e);
  await prisma.$disconnect();
  process.exit(1);
});
