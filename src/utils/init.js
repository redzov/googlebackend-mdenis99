import bcrypt from 'bcrypt';

/**
 * Initialize admin user if not exists
 */
export async function initializeAdmin(prisma) {
  const adminExists = await prisma.admin.findFirst();
  
  if (!adminExists) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await prisma.admin.create({
      data: {
        username,
        password: hashedPassword
      }
    });
    
    console.log(`Admin user created: ${username}`);
  }
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
