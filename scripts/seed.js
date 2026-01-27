const crypto = require('crypto')
const argon2 = require('argon2')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
}

const SALT_LENGTH = 16
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_LENGTH = 32

function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH).toString('base64')
}

async function hashPassword(password) {
  return argon2.hash(password, {
    ...ARGON2_CONFIG,
    salt: crypto.randomBytes(SALT_LENGTH),
  })
}

async function deriveMasterKey(password, salt) {
  const saltBuffer = Buffer.from(salt, 'base64')
  const hash = await argon2.hash(password, {
    ...ARGON2_CONFIG,
    salt: saltBuffer,
    raw: true,
  })
  return hash
}

function encrypt(plaintext, key) {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes (256 bits)`)
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  })
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return {
    version: 1,
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  }
}

function encryptForStorage(plaintext, key) {
  return JSON.stringify(encrypt(plaintext, key))
}

function generateKey() {
  return crypto.randomBytes(KEY_LENGTH)
}

async function createUserCredentials(password) {
  const salt = generateSalt()
  const passwordHash = await hashPassword(password)
  const masterKey = await deriveMasterKey(password, salt)
  const dek = generateKey()
  const encryptedDEK = encryptForStorage(dek.toString('base64'), masterKey)

  return {
    passwordHash,
    salt,
    encryptedDEK,
  }
}

async function main() {
  const setupConfig = await prisma.systemConfig.findUnique({
    where: { key: 'setup_completed' },
    select: { value: true },
  })
  const setupCompleted = setupConfig?.value === true || setupConfig?.value === 'true'

  let admin = await prisma.user.findUnique({
    where: { email: 'admin@invetrix.local' },
  })

  if (setupCompleted) {
    if (admin) {
      const replacement = await prisma.user.findFirst({
        where: {
          role: 'SUPER_ADMIN',
          email: { not: 'admin@invetrix.local' },
        },
        orderBy: { createdAt: 'asc' },
      })

      if (replacement) {
        await prisma.machine.updateMany({
          where: { createdById: admin.id },
          data: { createdById: replacement.id },
        })
        await prisma.credential.updateMany({
          where: { createdById: admin.id },
          data: { createdById: replacement.id },
        })
        await prisma.user.delete({ where: { id: admin.id } })
        admin = null
      }
    }
  } else if (!admin) {
    const credentials = await createUserCredentials('Admin@123!')

    admin = await prisma.user.create({
      data: {
        email: 'admin@invetrix.local',
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        ...credentials,
      },
    })
  }

  const platforms = [
    // Cloud Providers
    { name: 'AWS', category: 'Cloud', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonaws.svg', isProvider: true },
    { name: 'Google Cloud', category: 'Cloud', logoUrl: 'https://cdn.simpleicons.org/googlecloud/4285F4', isProvider: true },
    { name: 'Azure', category: 'Cloud', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/microsoftazure.svg', isProvider: true },
    { name: 'DigitalOcean', category: 'Cloud', logoUrl: 'https://cdn.simpleicons.org/digitalocean/0080FF', isProvider: true },
    { name: 'Vercel', category: 'Cloud', logoUrl: 'https://cdn.simpleicons.org/vercel/000000', isProvider: true },
    { name: 'Netlify', category: 'Cloud', logoUrl: 'https://cdn.simpleicons.org/netlify/00C7B7', isProvider: true },
    { name: 'Hetzner', category: 'Cloud', logoUrl: 'https://cdn.simpleicons.org/hetzner/D50C2D', isProvider: true },
    { name: 'Hostinger', category: 'Cloud', logoUrl: 'https://cdn.simpleicons.org/hostinger/673DE6', isProvider: true },
    { name: 'Linode', category: 'Cloud', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/linode.svg', isProvider: true },

    // DevOps
    { name: 'GitHub', category: 'DevOps', logoUrl: 'https://cdn.simpleicons.org/github/181717' },
    { name: 'GitLab', category: 'DevOps', logoUrl: 'https://cdn.simpleicons.org/gitlab/FC6D26' },
    { name: 'Docker Hub', category: 'DevOps', logoUrl: 'https://cdn.simpleicons.org/docker/2496ED' },
    { name: 'Kubernetes', category: 'DevOps', logoUrl: 'https://cdn.simpleicons.org/kubernetes/326CE5' },
    { name: 'Jenkins', category: 'DevOps', logoUrl: 'https://cdn.simpleicons.org/jenkins/D24939' },

    // Security
    { name: 'Cloudflare', category: 'Security', logoUrl: 'https://cdn.simpleicons.org/cloudflare/F38020' },

    // Database
    { name: 'PostgreSQL', category: 'Database', logoUrl: 'https://cdn.simpleicons.org/postgresql/4169E1' },
    { name: 'MySQL', category: 'Database', logoUrl: 'https://cdn.simpleicons.org/mysql/4479A1' },
    { name: 'MariaDB', category: 'Database', logoUrl: 'https://cdn.simpleicons.org/mariadb/003545' },
    { name: 'MongoDB', category: 'Database', logoUrl: 'https://cdn.simpleicons.org/mongodb/47A248' },
    { name: 'Redis', category: 'Database', logoUrl: 'https://cdn.simpleicons.org/redis/DC382D' },
    { name: 'SQLite', category: 'Database', logoUrl: 'https://cdn.simpleicons.org/sqlite/003B57' },
    { name: 'SQL Server', category: 'Database', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/microsoftsqlserver.svg' },

    // Monitoring
    { name: 'Grafana', category: 'Monitoring', logoUrl: 'https://cdn.simpleicons.org/grafana/F46800' },
    { name: 'Datadog', category: 'Monitoring', logoUrl: 'https://cdn.simpleicons.org/datadog/632CA6' },
    { name: 'New Relic', category: 'Monitoring', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/newrelic.svg' },

    // AI Platforms
    { name: 'OpenAI', category: 'IA', logoUrl: 'https://cdn.simpleicons.org/openai/412991' },
    { name: 'Anthropic', category: 'IA', logoUrl: 'https://cdn.simpleicons.org/anthropic/CD9B7A' },
    { name: 'Google AI', category: 'IA', logoUrl: 'https://cdn.simpleicons.org/google/4285F4' },
    { name: 'Hugging Face', category: 'IA', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/huggingface.svg' },
    { name: 'Replicate', category: 'IA', logoUrl: 'https://cdn.simpleicons.org/replicate/000000' },
    { name: 'Cohere', category: 'IA', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/cohere.svg' },
    { name: 'Stability AI', category: 'IA', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/stabilityai.svg' },
    { name: 'Midjourney', category: 'IA', logoUrl: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/midjourney.svg' },
  ]

  for (const platform of platforms) {
    const existingPlatform = await prisma.platform.findUnique({
      where: { name: platform.name },
    })

    if (existingPlatform) {
      const updates = {}
      if (!existingPlatform.logoUrl && platform.logoUrl) {
        updates.logoUrl = platform.logoUrl
      }
      if (!existingPlatform.category && platform.category) {
        updates.category = platform.category
      }
      if (platform.isProvider !== undefined && existingPlatform.isProvider !== platform.isProvider) {
        updates.isProvider = platform.isProvider
      }
      if (Object.keys(updates).length > 0) {
        await prisma.platform.update({
          where: { name: platform.name },
          data: updates,
        })
      }
      continue
    }

    await prisma.platform.create({
      data: platform,
    })
    
    // Se é provider, criar também no MachineProvider
    if (platform.isProvider) {
      await prisma.machineProvider.upsert({
        where: { name: platform.name },
        update: {},
        create: {
          name: platform.name,
          description: platform.category,
        },
      })
    }
  }

  // Create default stacks
  const stacks = [
    {
      name: 'WordPress',
      imageUrl: 'https://cdn.simpleicons.org/wordpress/21759B',
      dockerCompose: `version: '3.8'
services:
  wordpress:
    image: wordpress:latest
    restart: always
    ports:
      - "80:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: \${WORDPRESS_DB_PASSWORD}
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wordpress_data:/var/www/html
    depends_on:
      - db

  db:
    image: mysql:8.0
    restart: always
    environment:
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: \${WORDPRESS_DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql

volumes:
  wordpress_data:
  db_data:`,
      env: `WORDPRESS_DB_PASSWORD=your_secure_password_here
MYSQL_ROOT_PASSWORD=your_root_password_here`,
      instructions: 'Stack completa do WordPress com MySQL. Configure as senhas no arquivo .env antes do deploy.',
      mode: 'automatic'
    },
    {
      name: 'Nginx Proxy Manager',
      imageUrl: 'https://cdn.simpleicons.org/nginx/009639',
      dockerCompose: `version: '3.8'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: always
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    environment:
      DB_MYSQL_HOST: "db"
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: "npm"
      DB_MYSQL_PASSWORD: \${MYSQL_PASSWORD}
      DB_MYSQL_NAME: "npm"
    volumes:
      - npm_data:/data
      - npm_letsencrypt:/etc/letsencrypt
    depends_on:
      - db

  db:
    image: 'jc21/mariadb-aria:latest'
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: 'npm'
      MYSQL_USER: 'npm'
      MYSQL_PASSWORD: \${MYSQL_PASSWORD}
    volumes:
      - npm_mysql:/var/lib/mysql

volumes:
  npm_data:
  npm_letsencrypt:
  npm_mysql:`,
      env: `MYSQL_PASSWORD=your_secure_password
MYSQL_ROOT_PASSWORD=your_root_password`,
      instructions: 'Nginx Proxy Manager para gerenciar proxies reversos e certificados SSL. Acesse via porta 81 (admin@example.com / changeme).',
      mode: 'automatic'
    },
    {
      name: 'n8n',
      imageUrl: 'https://cdn.simpleicons.org/n8n/EA4B71',
      dockerCompose: `version: '3.8'
services:
  n8n:
    image: n8nio/n8n:latest
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=\${N8N_USER}
      - N8N_BASIC_AUTH_PASSWORD=\${N8N_PASSWORD}
      - N8N_HOST=\${N8N_HOST}
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - NODE_ENV=production
      - WEBHOOK_URL=\${N8N_WEBHOOK_URL}
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:`,
      env: `N8N_USER=admin
N8N_PASSWORD=your_secure_password
N8N_HOST=localhost
N8N_WEBHOOK_URL=http://localhost:5678`,
      instructions: 'Plataforma de automação n8n. Acesse via porta 5678 com as credenciais configuradas.',
      mode: 'automatic'
    },
    {
      name: 'Ghost Blog',
      imageUrl: 'https://cdn.simpleicons.org/ghost/15171A',
      dockerCompose: `version: '3.8'
services:
  ghost:
    image: ghost:latest
    restart: always
    ports:
      - "2368:2368"
    environment:
      database__client: mysql
      database__connection__host: db
      database__connection__user: ghost
      database__connection__password: \${GHOST_DB_PASSWORD}
      database__connection__database: ghost
      url: \${GHOST_URL}
    volumes:
      - ghost_content:/var/lib/ghost/content
    depends_on:
      - db

  db:
    image: mysql:8.0
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ghost
      MYSQL_USER: ghost
      MYSQL_PASSWORD: \${GHOST_DB_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql

volumes:
  ghost_content:
  db_data:`,
      env: `GHOST_DB_PASSWORD=your_ghost_password
MYSQL_ROOT_PASSWORD=your_root_password
GHOST_URL=http://localhost:2368`,
      instructions: 'Plataforma de blog Ghost com MySQL. Acesse via porta 2368 para configurar.',
      mode: 'automatic'
    },
    {
      name: 'Nextcloud',
      imageUrl: 'https://cdn.simpleicons.org/nextcloud/0082C9',
      dockerCompose: `version: '3.8'
services:
  nextcloud:
    image: nextcloud:latest
    restart: always
    ports:
      - "8080:80"
    environment:
      POSTGRES_HOST: db
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: \${NEXTCLOUD_DB_PASSWORD}
      NEXTCLOUD_ADMIN_USER: \${NEXTCLOUD_ADMIN_USER}
      NEXTCLOUD_ADMIN_PASSWORD: \${NEXTCLOUD_ADMIN_PASSWORD}
    volumes:
      - nextcloud_data:/var/www/html
    depends_on:
      - db

  db:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: \${NEXTCLOUD_DB_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data

volumes:
  nextcloud_data:
  db_data:`,
      env: `NEXTCLOUD_DB_PASSWORD=your_secure_password
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=your_admin_password`,
      instructions: 'Plataforma de armazenamento em nuvem Nextcloud. Acesse via porta 8080.',
      mode: 'automatic'
    },
    {
      name: 'Plausible Analytics',
      imageUrl: 'https://cdn.simpleicons.org/plausibleanalytics/5850EC',
      dockerCompose: `version: '3.8'
services:
  plausible:
    image: plausible/analytics:latest
    restart: always
    ports:
      - "8000:8000"
    environment:
      BASE_URL: \${BASE_URL}
      SECRET_KEY_BASE: \${SECRET_KEY_BASE}
      DATABASE_URL: postgres://plausible:\${POSTGRES_PASSWORD}@db:5432/plausible
    depends_on:
      - db
      - clickhouse

  db:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_DB: plausible
      POSTGRES_USER: plausible
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    restart: always
    volumes:
      - clickhouse_data:/var/lib/clickhouse

volumes:
  db_data:
  clickhouse_data:`,
      env: `BASE_URL=http://localhost:8000
SECRET_KEY_BASE=your_secret_key_base_64_chars
POSTGRES_PASSWORD=your_postgres_password`,
      instructions: 'Analytics alternativo ao Google Analytics. Configure o SECRET_KEY_BASE com 64 caracteres.',
      mode: 'manual'
    },
    {
      name: 'Portainer',
      imageUrl: 'https://cdn.simpleicons.org/portainer/13BEF9',
      dockerCompose: `version: '3.8'
services:
  portainer:
    image: portainer/portainer-ce:latest
    restart: always
    ports:
      - "9000:9000"
      - "9443:9443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data

volumes:
  portainer_data:`,
      env: ``,
      instructions: 'Gerenciador de containers Docker com interface web. Acesse via porta 9000 (HTTP) ou 9443 (HTTPS).',
      mode: 'automatic'
    },
    {
      name: 'Uptime Kuma',
      imageUrl: 'https://cdn.simpleicons.org/uptimekuma/5CDD8B',
      dockerCompose: `version: '3.8'
services:
  uptime-kuma:
    image: louislam/uptime-kuma:latest
    restart: always
    ports:
      - "3001:3001"
    volumes:
      - uptime_kuma_data:/app/data

volumes:
  uptime_kuma_data:`,
      env: ``,
      instructions: 'Monitor de uptime self-hosted. Acesse via porta 3001 para configurar.',
      mode: 'automatic'
    },
    {
      name: 'Minio',
      imageUrl: 'https://cdn.simpleicons.org/minio/C72E49',
      dockerCompose: `version: '3.8'
services:
  minio:
    image: minio/minio:latest
    restart: always
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: \${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: \${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"

volumes:
  minio_data:`,
      env: `MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123`,
      instructions: 'Object storage compatível com S3. Console em porta 9001, API em porta 9000.',
      mode: 'automatic'
    },
    {
      name: 'Grafana',
      imageUrl: 'https://cdn.simpleicons.org/grafana/F46800',
      dockerCompose: `version: '3.8'
services:
  grafana:
    image: grafana/grafana:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_USER: \${ADMIN_USER}
      GF_SECURITY_ADMIN_PASSWORD: \${ADMIN_PASSWORD}
      GF_INSTALL_PLUGINS: \${PLUGINS}
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  grafana_data:`,
      env: `ADMIN_USER=admin
ADMIN_PASSWORD=admin123
PLUGINS=`,
      instructions: 'Plataforma de visualização e analytics. Acesse via porta 3000.',
      mode: 'automatic'
    },
    {
      name: 'Prometheus',
      imageUrl: 'https://cdn.simpleicons.org/prometheus/E6522C',
      dockerCompose: `version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    restart: always
    ports:
      - "9090:9090"
    volumes:
      - prometheus_data:/prometheus
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

volumes:
  prometheus_data:`,
      env: ``,
      instructions: 'Sistema de monitoramento e alertas. Acesse via porta 9090. Requer arquivo prometheus.yml.',
      mode: 'manual'
    },
    {
      name: 'Redis',
      imageUrl: 'https://cdn.simpleicons.org/redis/DC382D',
      dockerCompose: `version: '3.8'
services:
  redis:
    image: redis:alpine
    restart: always
    ports:
      - "6379:6379"
    command: redis-server --requirepass \${REDIS_PASSWORD}
    volumes:
      - redis_data:/data

volumes:
  redis_data:`,
      env: `REDIS_PASSWORD=your_secure_password`,
      instructions: 'Banco de dados em memória Redis. Porta 6379.',
      mode: 'automatic'
    },
    {
      name: 'PostgreSQL',
      imageUrl: 'https://cdn.simpleicons.org/postgresql/4169E1',
      dockerCompose: `version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    restart: always
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:`,
      env: `POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=mydb`,
      instructions: 'Banco de dados PostgreSQL. Porta 5432.',
      mode: 'automatic'
    },
    {
      name: 'MySQL',
      imageUrl: 'https://cdn.simpleicons.org/mysql/4479A1',
      dockerCompose: `version: '3.8'
services:
  mysql:
    image: mysql:8.0
    restart: always
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: \${MYSQL_DATABASE}
      MYSQL_USER: \${MYSQL_USER}
      MYSQL_PASSWORD: \${MYSQL_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:`,
      env: `MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_DATABASE=mydb
MYSQL_USER=user
MYSQL_PASSWORD=your_password`,
      instructions: 'Banco de dados MySQL. Porta 3306.',
      mode: 'automatic'
    },
    {
      name: 'MongoDB',
      imageUrl: 'https://cdn.simpleicons.org/mongodb/47A248',
      dockerCompose: `version: '3.8'
services:
  mongodb:
    image: mongo:latest
    restart: always
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: \${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_PASSWORD}
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:`,
      env: `MONGO_USER=admin
MONGO_PASSWORD=your_secure_password`,
      instructions: 'Banco de dados MongoDB. Porta 27017.',
      mode: 'automatic'
    },
    {
      name: 'Matomo',
      imageUrl: 'https://cdn.simpleicons.org/matomo/3152A0',
      dockerCompose: `version: '3.8'
services:
  matomo:
    image: matomo:latest
    restart: always
    ports:
      - "8080:80"
    environment:
      MATOMO_DATABASE_HOST: db
      MATOMO_DATABASE_ADAPTER: mysql
      MATOMO_DATABASE_TABLES_PREFIX: matomo_
      MATOMO_DATABASE_USERNAME: matomo
      MATOMO_DATABASE_PASSWORD: \${MATOMO_DB_PASSWORD}
      MATOMO_DATABASE_DBNAME: matomo
    volumes:
      - matomo_data:/var/www/html
    depends_on:
      - db

  db:
    image: mariadb:10
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: matomo
      MYSQL_USER: matomo
      MYSQL_PASSWORD: \${MATOMO_DB_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql

volumes:
  matomo_data:
  db_data:`,
      env: `MATOMO_DB_PASSWORD=your_secure_password
MYSQL_ROOT_PASSWORD=your_root_password`,
      instructions: 'Analytics open source alternativo ao Google Analytics. Acesse via porta 8080.',
      mode: 'automatic'
    },
    {
      name: 'Gitea',
      imageUrl: 'https://cdn.simpleicons.org/gitea/609926',
      dockerCompose: `version: '3.8'
services:
  gitea:
    image: gitea/gitea:latest
    restart: always
    ports:
      - "3000:3000"
      - "222:22"
    environment:
      USER_UID: 1000
      USER_GID: 1000
      GITEA__database__DB_TYPE: postgres
      GITEA__database__HOST: db:5432
      GITEA__database__NAME: gitea
      GITEA__database__USER: gitea
      GITEA__database__PASSWD: \${GITEA_DB_PASSWORD}
    volumes:
      - gitea_data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_USER: gitea
      POSTGRES_PASSWORD: \${GITEA_DB_PASSWORD}
      POSTGRES_DB: gitea
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  gitea_data:
  postgres_data:`,
      env: `GITEA_DB_PASSWORD=your_secure_password`,
      instructions: 'Git self-hosted leve. Web em porta 3000, SSH em porta 222.',
      mode: 'automatic'
    },
    {
      name: 'Vaultwarden',
      imageUrl: 'https://cdn.simpleicons.org/bitwarden/175DDC',
      dockerCompose: `version: '3.8'
services:
  vaultwarden:
    image: vaultwarden/server:latest
    restart: always
    ports:
      - "8080:80"
    environment:
      DOMAIN: \${DOMAIN}
      SIGNUPS_ALLOWED: \${SIGNUPS_ALLOWED}
      ADMIN_TOKEN: \${ADMIN_TOKEN}
    volumes:
      - vaultwarden_data:/data

volumes:
  vaultwarden_data:`,
      env: `DOMAIN=https://vault.example.com
SIGNUPS_ALLOWED=true
ADMIN_TOKEN=your_random_admin_token`,
      instructions: 'Gerenciador de senhas compatível com Bitwarden. Acesse via porta 8080.',
      mode: 'automatic'
    }
  ]

  for (const stack of stacks) {
    const existingStack = await prisma.stack.findUnique({
      where: { name: stack.name },
    })

    if (!existingStack) {
      await prisma.stack.create({
        data: stack,
      })
    }
  }

  if (admin) {
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'CREATE',
        resourceType: 'USER',
        resourceId: admin.id,
        resourceName: admin.name,
        ipAddress: 'system',
        metadata: { note: 'Initial system setup' },
      },
    })
  }

  console.log('Seed completed.')
  if (!setupCompleted && admin) {
    console.log('')
    console.log('===========================================')
    console.log('  Login credentials:')
    console.log('  Email: admin@invetrix.local')
    console.log('  Password: Admin@123!')
    console.log('===========================================')
    console.log('')
    console.log('IMPORTANT: Change the password after first login!')
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
