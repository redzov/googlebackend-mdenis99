import bcrypt from 'bcrypt';

/**
 * Initialize admin user - creates or updates to match env credentials
 */
export async function initializeAdmin(prisma) {
  const username = process.env.ADMIN_USERNAME || 'admin928468';
  const password = process.env.ADMIN_PASSWORD || '74a7eaca-b3ed-423d-9e9a-158d58222ae6';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Delete all existing admins to ensure only one admin with correct credentials
  await prisma.admin.deleteMany({});

  // Create admin with specified credentials
  await prisma.admin.create({
    data: {
      username,
      password: hashedPassword
    }
  });

  console.log(`Admin initialized: ${username}`);
}

/**
 * Initialize default settings if not exists
 */
export async function initializeSettings(prisma) {
  const settings = await prisma.settings.findFirst();
  
  if (!settings) {
    await prisma.settings.create({
      data: {
        id: 'main',
        defaultPassword: 'ChangeMe123!',
        threads: 1,
        proxyApiKey: process.env.PROXY_API_KEY || null,
        fingerprintApiKey: process.env.FINGERPRINT_API_KEY || null
      }
    });
    
    console.log('Default settings created');
  }
}
