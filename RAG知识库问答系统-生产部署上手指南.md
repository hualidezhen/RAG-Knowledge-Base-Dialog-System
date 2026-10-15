# 🚢 RAG 知识库问答系统 — 生产部署上手指南

> **适用对象：** 已能本地运行项目，想把它部署到公网服务器上
> **目标：** 从零开始，把一个可用的 RAG 系统部署到生产环境，支持 HTTPS 公网访问
> **预估耗时：** 1-3 天（取决于服务器和域名准备速度）

---

## 📋 目录

- [一、当前项目还缺什么？](#一当前项目还缺什么)
- [二、部署架构图](#二部署架构图)
- [三、准备工作清单](#三准备工作清单)
- [四、服务器选购与初始化](#四服务器选购与初始化)
- [五、域名与 SSL 证书](#五域名与-ssl-证书)
- [六、安全加固](#六安全加固)
- [七、生产环境 Docker 配置](#七生产环境-docker-配置)
- [八、部署步骤（保姆级）](#八部署步骤保姆级)
- [九、验证与测试](#九验证与测试)
- [十、监控与运维](#十监控与运维)
- [十一、自动化部署 (CI/CD)](#十一自动化部署-cicd)
- [十二、常见问题排查](#十二常见问题排查)
- [十三、费用预估](#十三费用预估)

---

## 一、当前项目还缺什么？

### 1.1 现状 vs 生产要求

| 维度 | 当前状态 | 生产需要 | 重要性 |
|------|---------|---------|--------|
| **访问协议** | HTTP 明文 | HTTPS 加密 | ⭐⭐⭐⭐⭐ |
| **API Key 管理** | .env 文件明文 | Docker Secrets / 环境变量加密 | ⭐⭐⭐⭐⭐ |
| **用户认证** | 无 → 谁都能用 | 需要登录系统 | ⭐⭐⭐⭐ |
| **速率限制** | 无 → 可被刷接口 | 限制每人每分钟请求数 | ⭐⭐⭐⭐ |
| **CORS** | 完全开放 | 限定特定域名 | ⭐⭐⭐ |
| **日志系统** | 控制台输出 | 文件日志 + 日志轮转 | ⭐⭐⭐⭐ |
| **错误监控** | 无 | Sentry / 错误报警 | ⭐⭐⭐ |
| **数据备份** | 无 | 定时备份 ChromaDB + 配置文件 | ⭐⭐⭐⭐⭐ |
| **进程管理** | 手动启动 | Docker 重启策略 | ⭐⭐⭐⭐ |
| **持久化存储** | 部分依赖容器 | 独立数据卷 + 定时备份 | ⭐⭐⭐⭐⭐ |
| **性能优化** | 基础配置 | Nginx 缓存 + CDN | ⭐⭐ |
| **CI/CD** | 无 | 自动化部署流水线 | ⭐⭐⭐ |

### 1.2 最简可行部署 (Minimum Viable Deploy)

如果只想要**快速上线测试**，最简需要补齐的是：

```
1. ✅ HTTPS (Let's Encrypt 免费证书)
2. ✅ Docker 重启策略 (容器挂了自动重启)
3. ✅ .env 密钥保护 (文件权限 600)
4. ✅ Nginx 安全配置 (限制 IP, 防扫描)
5. ⬜ 用户认证 (可后续加)
6. ⬜ 速率限制 (可后续加)
```

---

## 二、部署架构图

```
                         互联网
                           │
                     HTTPS :443
                           │
                     ┌─────┴──────┐
                     │   Nginx    │  ← 反向代理 + SSL 终结
                     │ (宿主机)    │     静态资源缓存
                     └─────┬──────┘
                           │
                    反向代理 /api/ → :3001
                           │
              ┌────────────┼────────────┐
              │            │            │
         [Server]     [ChromaDB]   [可选: Redis]
         :3001         :8000         :6379
              │            │
         [DeepSeek API] [智谱 AI API]
         (外部服务)     (外部服务)
```

### 推荐方案：Docker Compose 部署

```
服务器 (Ubuntu 22.04)
│
├── Nginx (宿主机，非 Docker)
│   ├── SSL 证书管理
│   ├── HTTPS 反向代理
│   └── 静态文件缓存
│
└── Docker Compose
    ├── server (Node.js :3001)
    │   ├── 依赖: chromadb 启动成功后才启动
    │   └── 挂载: .env, data/uploads, data/collections.json, data/memories/, data/metrics/, data/feedback/
    │
    ├── chromadb (向量数据库 :8000)
    │   ├── 挂载: chroma_data 持久化卷
    │   └── 健康检查: /api/v2/heartbeat
    │
    └── client (Nginx 静态文件 :80)
        └── 构建产物: dist/
```

> 为什么不把 Nginx 放 Docker？  
> 因为 SSL 证书管理（Let's Encrypt 的 certbot）在宿主机上更方便。  
> 如果你用云厂商的 LB（负载均衡器），SSL 在 LB 层终结，可以全放 Docker。

---

## 三、准备工作清单

### 3.1 必备项

| 项目 | 费用 | 说明 | 推荐 |
|------|------|------|------|
| **云服务器** | ¥50-200/月 | 1核2G 起步，建议 2核4G | 阿里云/腾讯云/华为云 轻量应用服务器 |
| **域名** | ¥30-80/年 | 国内需备案 | 阿里云万网/腾讯云 DNSPod |
| **SSL 证书** | 免费 | Let's Encrypt | certbot / acme.sh |

### 3.2 软件版本要求

| 软件 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Ubuntu | 20.04 | **22.04 LTS** |
| Docker | 24.0 | 最新稳定版 |
| Docker Compose | v2.20 | 最新稳定版 |
| Node.js | 18 | 20 LTS |
| Nginx | 1.18 | 1.24+ |

### 3.3 信息速查表

部署过程中需要的信息清单，提前准备好：

```
服务器公网 IP:   ___________
域名:            ___________
SSH 端口:        22 (建议改高位端口)
DeepSeek API Key: ___________
智谱 AI API Key:  ___________
管理员邮箱:       ___________ (SSL 证书注册用)
```

---

## 四、服务器选购与初始化

### 4.1 服务器推荐

| 厂商 | 机型 | 配置 | 价格 | 适合 |
|------|------|------|------|------|
| **阿里云** | 轻量应用服务器 | 2核2G 60GB | ¥68/月 | 个人/小团队 |
| **腾讯云** | 轻量应用服务器 | 2核4G 80GB | ¥95/月 | 推荐配置 |
| **华为云** | HECS | 2核4G 40GB | ¥89/月 | 企业用户 |
| **AWS** | Lightsail | 2核4G 80GB | $20/月 | 海外用户 |

> 💡 **省钱技巧：** 阿里云/腾讯云经常有"新用户"优惠，1核2G 一年才 ¥99。  
> 如果你已过新用户期，用家人的账号注册。

### 4.2 服务器初始配置

```bash
# ─── SSH 登录服务器 ───
ssh root@你的服务器IP

# ─── 1. 更新系统 ───
apt update && apt upgrade -y

# ─── 2. 创建普通用户（安全起见，不用 root）───
adduser deploy                 # 创建用户，设置密码
usermod -aG sudo deploy        # 赋予 sudo 权限

# ─── 3. SSH 安全配置 ───
vim /etc/ssh/sshd_config
# 修改以下配置：
#   Port 2222                    # 改掉默认 22 端口，防扫描
#   PermitRootLogin no           # 禁止 root 直接登录
#   PasswordAuthentication no    # 禁止密码登录（如果你配了 SSH Key）
#   AllowUsers deploy            # 只允许 deploy 用户登录
systemctl restart sshd

# 注意！改完 SSH 配置后新开一个终端测试登录：
# ssh deploy@你的服务器IP -p 2222
# 确认能登录后再关闭原终端

# ─── 4. 安装 Docker ───
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker deploy  # 让 deploy 用户不用 sudo 就能用 docker
# 退出重新登录使组生效

# ─── 5. 安装 Docker Compose ───
sudo apt install -y docker-compose-plugin
# 验证:
docker compose version

# ─── 6. 安装 Nginx ───
sudo apt install -y nginx

# ─── 7. 安装防火墙 ───
sudo apt install -y ufw
sudo ufw allow 2222/tcp      # SSH 端口（你改的哪个就放哪个）
sudo ufw allow 80/tcp        # HTTP
sudo ufw allow 443/tcp       # HTTPS
sudo ufw enable
sudo ufw status               # 确认防火墙状态
```

---

## 五、域名与 SSL 证书

### 5.1 域名配置

假设你购买了 `example.com`：

```bash
# 在域名 DNS 管理后台添加 A 记录：
# 主机记录   记录类型   记录值
# @          A          你的服务器IP
# www        A          你的服务器IP
```

DNS 生效需要几分钟到几小时，可以用 `ping yourdomain.com` 检查。

### 5.2 申请 SSL 证书（推荐 acme.sh）

```bash
# ─── 1. 安装 acme.sh ───
curl https://get.acme.sh | sh
source ~/.bashrc

# ─── 2. 申请证书（HTTP 验证方式）───
# 确保 Nginx 已运行且 80 端口可访问
~/.acme.sh/acme.sh --issue -d yourdomain.com -d www.yourdomain.com --nginx

# 如果遇到 80 端口冲突，可以临时停掉 Nginx：
# systemctl stop nginx
# ~/.acme.sh/acme.sh --issue -d yourdomain.com --standalone
# systemctl start nginx

# ─── 3. 安装证书到 Nginx 目录 ───
~/.acme.sh/acme.sh --install-cert -d yourdomain.com \
  --key-file /etc/nginx/ssl/yourdomain.com.key \
  --fullchain-file /etc/nginx/ssl/yourdomain.com.crt \
  --reloadcmd "systemctl force-reload nginx"

# ─── 4. 验证证书 ───
ls -la /etc/nginx/ssl/
# 应该看到 yourdomain.com.key 和 yourdomain.com.crt
```

> acme.sh 会自动添加定时任务（cron）自动续期证书，无需手动管理。

---

## 六、安全加固

### 6.1 生产环境 .env 文件

```bash
# ─── 放在服务器上：权限加固 ───
# 路径: /home/deploy/rag-system/.env
# 不要把这个文件提交到 Git！
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ZHIPU_API_KEY=your-zhipu-key
CHROMA_URL=http://chromadb:8000  # Docker 内部网络，不要用 localhost
PORT=3001

# 文件权限：只有 deploy 用户能读
chmod 600 .env
# 检查：ls -la .env → -rw-------  (只有所有者能读写)
```

### 6.2 生产环境 Nginx 配置

> 配置文件路径: `/etc/nginx/sites-available/rag-system`

```nginx
# /etc/nginx/sites-available/rag-system

# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS 服务器
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL 配置
    ssl_certificate /etc/nginx/ssl/yourdomain.com.crt;
    ssl_certificate_key /etc/nginx/ssl/yourdomain.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 静态文件 (前端构建产物)
    # 生产构建后用 docker cp 或挂载卷到宿主机
    root /home/deploy/rag-system/client-dist;
    index index.html;

    # SPA 路由：所有非 API 请求返回 index.html
    location / {
        try_files $uri $uri/ /index.html;

        # 静态资源缓存（带 hash 的文件名可长期缓存）
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3001;  # 指向 Docker 映射端口
        proxy_http_version 1.1;

        # SSE 关键配置！
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;

        # 传递真实 IP
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 限制请求速率（防刷）
    location /api/chat {
        limit_req zone=chat burst=5 nodelay;
        proxy_pass http://127.0.0.1:3001;
        # ... 上述 proxy 配置同上 ...
    }

    # Agent 聊天端点（也受限流保护）
    location /api/agent/chat {
        limit_req zone=chat burst=5 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_buffering off;   # SSE 必须关缓冲
    }

    # 监控端点（低延迟高频率，不限流）
    location /api/monitor/ {
        proxy_pass http://127.0.0.1:3001;
    }

    # 反馈端点
    location /api/feedback/ {
        proxy_pass http://127.0.0.1:3001;
    }

    # 评估端点
    location /api/evaluation/ {
        proxy_pass http://127.0.0.1:3001;
    }

    # 限制上传大小（和后端一致）
    client_max_body_size 60M;

    # 日志
    access_log /var/log/nginx/rag-access.log;
    error_log /var/log/nginx/rag-error.log;
}
```

**启用配置：**

```bash
# 创建限流区域（在 http 块中定义）
vim /etc/nginx/nginx.conf
# 在 http {} 块中添加：
#   limit_req_zone $binary_remote_addr zone=chat:10m rate=6r/m;
#   这表示：每个 IP 每分钟最多 6 次 chat 请求

# 启用站点
ln -s /etc/nginx/sites-available/rag-system /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default  # 移除默认站点

# 测试配置
nginx -t

# 重载 Nginx
systemctl reload nginx
```

### 6.3 fail2ban 防暴力破解

```bash
sudo apt install -y fail2ban

# 配置 SSH 保护
sudo tee /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600          # 封禁 1 小时
findtime = 600          # 检测窗口 10 分钟
maxretry = 5            # 最多 5 次失败

[sshd]
enabled = true
port = 2222             # 你的 SSH 端口
EOF

sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

### 6.4 API Key 安全要点

| 安全风险 | 当前问题 | 解决方案 |
|---------|---------|---------|
| API Key 硬编码 | .env 文件明文 | 文件权限 chmod 600，不提交 Git |
| 前端 API Key 暴露 | 存在 localStorage | 前端 Key 仅作为"用户自己配置"，服务端应有默认 Key |
| 无认证调用 | 谁都能调 /api/chat | 添加 API Token 认证（参考第十一章优化） |

---

## 七、生产环境 Docker 配置

### 7.1 修改 docker-compose.yml

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  chromadb:
    image: chromadb/chroma:latest
    container_name: rag-chromadb
    restart: always                           # 自动重启
    volumes:
      - chroma_data:/chroma/chroma           # 持久化向量数据
    environment:
      - IS_PERSISTENT=TRUE
      - PERSIST_DIRECTORY=/chroma/chroma
      - ANONYMIZED_TELEMETRY=FALSE           # 关闭遥测
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v2/heartbeat"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - rag-network
    logging:                                  # 日志限制
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  server:
    build:
      context: ./packages/server
      dockerfile: Dockerfile
    container_name: rag-server
    restart: always
    depends_on:
      chromadb:
        condition: service_healthy           # ChromaDB 健康后才启动
    env_file:
      - .env                                 # 生产环境 .env
    environment:
      - CHROMA_URL=http://chromadb:8000       # Docker 内部网络
      - NODE_ENV=production
    volumes:
      - ./packages/server/data:/app/data      # 持久化上传文件 + collections.json + memories/ + metrics/ + feedback/
    ports:
      - "127.0.0.1:3001:3001"                 # 只监听本地，不暴露公网
    networks:
      - rag-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # 注意：前端用 Nginx 容器，或者用宿主机 Nginx 直接服务静态文件
  # 这里选择：宿主机 Nginx 服务静态文件，更简单
  # 如果你想要全容器化，可以取消下面的注释
  # client:
  #   build:
  #     context: ./packages/client
  #     dockerfile: Dockerfile
  #   container_name: rag-client
  #   restart: always
  #   depends_on:
  #     - server
  #   ports:
  #     - "127.0.0.1:8080:80"
  #   networks:
  #     - rag-network

networks:
  rag-network:
    driver: bridge

volumes:
  chroma_data:
    driver: local
```

> 关键变更说明：
> 1. **`restart: always`** — 容器挂了自动重启
> 2. **`depends_on` 加 condition** — 等 ChromaDB 健康后再启动 server
> 3. **`127.0.0.1:3001:3001`** — server 只监听本地，由宿主机 Nginx 转发
> 4. **持久化数据卷** — `chroma_data` 和 `data/` 目录

### 7.2 构建前端静态文件

```bash
# 在本地或 CI 中构建
cd packages/client
npm install
npm run build

# 将 dist/ 目录传到服务器
# 方案 A: 直接本地 scp 上传
scp -P 2222 -r dist/* deploy@yourdomain.com:/home/deploy/rag-system/client-dist/

# 方案 B: 在服务器上构建（需要安装 Node.js）
# 服务器上 Node.js 安装：
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

cd /home/deploy/rag-system/packages/client
npm install
npm run build
cp -r dist/* /home/deploy/rag-system/client-dist/
```

---

## 八、部署步骤（保姆级）

### 步骤 1：服务器上创建项目目录

```bash
ssh deploy@你的服务器IP -p 2222

# 创建项目根目录
mkdir -p /home/deploy/rag-system
cd /home/deploy/rag-system
```

### 步骤 2：拉取代码

```bash
# 方式 A：直接 Git clone（推荐）
git clone https://github.com/你的用户名/RAG-Knowledge-Base-Dialog-System.git .

# 方式 B：本地打包上传
# 在本地执行：
# tar czf rag-system.tar.gz --exclude=node_modules --exclude=dist .
# scp -P 2222 rag-system.tar.gz deploy@yourdomain.com:/home/deploy/rag-system/
# 在服务器上解压：
# tar xzf rag-system.tar.gz
```

### 步骤 3：创建 .env 文件

```bash
cp packages/server/.env.example .env
chmod 600 .env
vim .env
# ─── 填入真实值 ───
# DEEPSEEK_API_KEY=sk-xxxx
# DEEPSEEK_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
# ZHIPU_API_KEY=xxxx
# CHROMA_URL=http://chromadb:8000
# PORT=3001
```

### 步骤 4：创建数据持久化目录

```bash
mkdir -p packages/server/data/uploads
chmod -R 755 packages/server/data
```

### 步骤 5：构建前端

```bash
# 方案一：在服务器上构建
cd packages/client
npm install
npm run build
cd ../..

# 复制到 Nginx 静态目录
sudo mkdir -p /home/deploy/rag-system/client-dist
sudo cp -r packages/client/dist/* /home/deploy/rag-system/client-dist/
sudo chown -R deploy:deploy /home/deploy/rag-system/client-dist
```

### 步骤 6：配置 Nginx

```bash
# 创建 SSL 目录
sudo mkdir -p /etc/nginx/ssl

# 创建 Nginx 配置文件（用上面第六章的配置）
sudo vim /etc/nginx/sites-available/rag-system
# 粘贴第 6.2 节的配置内容，替换 yourdomain.com 为你的域名

# 创建日志目录
sudo mkdir -p /var/log/nginx

# 启用站点
sudo ln -sf /etc/nginx/sites-available/rag-system /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试并重载
sudo nginx -t && sudo systemctl reload nginx
```

### 步骤 7：启动服务

```bash
# 启动 Docker Compose（从项目根目录）
cd /home/deploy/rag-system
docker compose -f docker-compose.prod.yml up -d

# 查看启动日志
docker compose -f docker-compose.prod.yml logs -f

# 确认所有服务运行
docker compose -f docker-compose.prod.yml ps

# 预期输出：
# NAME                  SERVICE             STATUS              PORTS
# rag-chromadb          chromadb            running (healthy)   0.0.0.0:8000->8000/tcp
# rag-server            server              running             127.0.0.1:3001->3001/tcp
```

### 步骤 8：验证部署

```bash
# 测试健康检查接口
curl http://localhost:3001/api/health
# 预期: {"status":"ok","timestamp":"..."}

# 测试知识库接口
curl http://localhost:3001/api/knowledge-bases
# 预期: {"knowledgeBases":[...]}

# 测试 HTTPS 公网访问
curl https://yourdomain.com/api/health
# 预期: 正常返回 JSON

# 浏览器访问 https://yourdomain.com
# 预期: 看到登录页面
```

### 全流程示意图

```
本地开发环境                         生产服务器
┌──────────────┐                  ┌──────────────────────────┐
│  git push    │ ──── git clone → │  /home/deploy/rag-system  │
│              │                  │                           │
│  npm run     │                  │  Docker Compose           │
│  build       │ ──── dist/ ────→ │  ├─ server :3001         │
│              │                  │  └─ chromadb :8000        │
└──────────────┘                  │                           │
                                  │  Nginx                    │
                                  │  ├─ SSL (Let's Encrypt)   │
                                  │  ├─ HTTPS :443            │
                                  │  └─ HTTP → HTTPS :80      │
                                  │                           │
                                  │  UFW 防火墙               │
                                  │  允许: 2222, 80, 443     │
                                  └──────────────────────────┘
```

---

## 九、验证与测试

### 9.1 部署后检查清单

| 检查项 | 验证方式 | 预期结果 |
|--------|---------|---------|
| HTTPS 访问 | 浏览器打开 `https://yourdomain.com` | 显示应用，锁图标 |
| HTTP 重定向 | 访问 `http://yourdomain.com` | 自动跳转到 HTTPS |
| API 可用 | `curl https://yourdomain.com/api/health` | `{"status":"ok"}` |
| SSE 流式 | 发一条聊天消息 | 看到流式输出效果 |
| Agent 聊天 | `POST /api/agent/chat` 发一条消息 | 返回 SSE 流含 agent_thinking 事件 |
| 监控可用 | `curl /api/monitor/realtime` | 包含 qps / avgLatencyMs 字段 |
| 反馈可用 | `POST /api/feedback` 提交评分 | 返回 feedbackEntry 含 id |
| 文档上传 | 上传一个 PDF | 上传成功，可以检索 |
| 容器状态 | `docker compose ps` | 所有容器正常运行 |
| 自动重启 | `docker stop rag-server` | 几秒后自动重启 |
| SSL 证书 | `curl -vI https://yourdomain.com` | 看到 SSL 证书信息 |
| 记忆服务 | `ls data/memories/` | 有会话摘要 JSON 文件 |
| 监控服务 | `curl /api/monitor/realtime` | 返回 qps/avgLatencyMs/toolCallCount 字段 |
| 反馈服务 | `curl /api/feedback/stats` | 返回 total/avgRating/distribution 字段 |
| Agent 日志 | `docker compose logs server \| grep "AgentRun"` | 有 agent_thinking 事件记录 |

### 9.2 常见问题快速排查

```bash
# Nginx 有问题？
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/rag-error.log

# Docker 有问题？
docker compose -f docker-compose.prod.yml logs server
docker compose -f docker-compose.prod.yml logs chromadb

# 防火墙有问题？
sudo ufw status

# API 返回 502？（Nginx 连不上 Docker）
# 检查 server 是否在监听 127.0.0.1:3001
curl http://localhost:3001/api/health
```

---

## 十、监控与运维

### 10.1 容器监控

```bash
# 查看所有容器状态
docker compose -f docker-compose.prod.yml ps

# 查看实时日志（像 tail -f）
docker compose -f docker-compose.prod.yml logs -f server

# 查看资源占用
docker stats

# 查看最后 100 行日志
docker compose -f docker-compose.prod.yml logs --tail=100 server
```

### 10.2 日志轮转

Docker 默认日志会无限增长。已在 docker-compose 中配置：
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"   # 每个日志文件最大 10MB
    max-file: "3"     # 保留最近 3 个文件
```

Nginx 日志轮转（系统自带）：
```bash
# 检查 logrotate 配置
cat /etc/logrotate.d/nginx

# 测试日志轮转
sudo logrotate -d /etc/logrotate.d/nginx
```

### 10.3 数据备份（重要！）

```bash
#!/bin/bash
# /home/deploy/rag-system/backup.sh
# 添加到 crontab：每天凌晨 2 点执行

# 配置
BACKUP_DIR="/home/deploy/backups"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 1. 备份 ChromaDB 数据
docker run --rm -v rag_chroma_data:/data -v $BACKUP_DIR:/backup alpine \
  tar czf /backup/chromadb_$DATE.tar.gz -C /data .

# 2. 备份上传文件
tar czf $BACKUP_DIR/uploads_$DATE.tar.gz -C /home/deploy/rag-system/packages/server/data uploads

# 3. 备份 P3-P5 运行时数据（记忆/监控/反馈）
tar czf $BACKUP_DIR/run_data_$DATE.tar.gz -C /home/deploy/rag-system/packages/server/data \
  memories metrics feedback

# 4. 备份配置
cp /home/deploy/rag-system/.env $BACKUP_DIR/env_$DATE.backup
cp /home/deploy/rag-system/packages/server/data/collections.json $BACKUP_DIR/collections_$DATE.json

# 5. 删除 30 天前的备份
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.backup" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.json" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
```

```bash
# 添加到定时任务
crontab -e
# 添加：
0 2 * * * /bin/bash /home/deploy/rag-system/backup.sh >> /home/deploy/backups/backup.log 2>&1
```

### 10.4 无监控不上线（免费方案）

```bash
# 方案一：Node.js 进程监控 → 已用 Docker restart=always

# 方案二：uptime 监控（免费）
# - UptimeRobot (https://uptimerobot.com) → 免费监控 5 个站点
# - 每 5 分钟检查你的网站是否在线

# 方案三：简易自建监控脚本
# /home/deploy/rag-system/healthcheck.sh
#!/bin/bash
if ! curl -sf http://localhost:3001/api/health > /dev/null; then
  echo "Server down! Restarting..."
  cd /home/deploy/rag-system && docker compose -f docker-compose.prod.yml restart server
fi
```

### 10.5 更新部署（日常维护）

```bash
# ─── 更新代码 ───
cd /home/deploy/rag-system
git pull origin main

# ─── 重新构建前端 ───
cd packages/client
npm install
npm run build
sudo cp -r dist/* /home/deploy/rag-system/client-dist/
cd ../..

# ─── 重新构建后端 ───
docker compose -f docker-compose.prod.yml build server

# ─── 重启服务 ───
docker compose -f docker-compose.prod.yml up -d --force-recreate

# ─── 清理旧镜像 ───
docker image prune -f
```

---

## 十一、自动化部署 (CI/CD)

### 11.1 GitHub Actions 自动部署

```yaml
# .github/workflows/deploy.yml

name: Deploy to Production

on:
  push:
    branches: [ main ]           # 推送到 main 分支时触发

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install & Build Client
        run: |
          cd packages/client
          npm install
          npm run build

      - name: Deploy via rsync
        uses: burnett01/rsync-deployments@7.0.1
        with:
          switches: -avzr --delete
          path: ./packages/client/dist/
          remote_path: /home/deploy/rag-system/client-dist/
          remote_host: ${{ secrets.DEPLOY_HOST }}
          remote_port: ${{ secrets.DEPLOY_PORT }}
          remote_user: ${{ secrets.DEPLOY_USER }}
          remote_key: ${{ secrets.DEPLOY_KEY }}

      - name: Deploy server code & restart
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          port: ${{ secrets.DEPLOY_PORT }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /home/deploy/rag-system
            git pull origin main
            docker compose -f docker-compose.prod.yml build server
            docker compose -f docker-compose.prod.yml up -d --force-recreate server
            docker image prune -f
```

**需要在 GitHub Secrets 中配置：**

| Secret 名 | 值 |
|-----------|-----|
| `DEPLOY_HOST` | 服务器 IP |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_USER` | deploy |
| `DEPLOY_KEY` | 服务器的 SSH 私钥 |

### 11.2 手动部署脚本

如果你不想用 CI/CD，写个一键部署脚本：

```bash
#!/bin/bash
# /home/deploy/rag-system/deploy.sh

set -e

echo "🚀 开始部署 RAG 系统..."

cd /home/deploy/rag-system

echo "📦 拉取最新代码..."
git pull origin main

echo "🔨 构建前端..."
cd packages/client
npm install
npm run build
sudo cp -r dist/* /home/deploy/rag-system/client-dist/
cd ../..

echo "🐳 构建并重启后端..."
docker compose -f docker-compose.prod.yml build server
docker compose -f docker-compose.prod.yml up -d --force-recreate server

echo "🧹 清理旧镜像..."
docker image prune -f

echo "✅ 部署完成！"
echo "🌐 https://yourdomain.com"
```

使用：`chmod +x deploy.sh && ./deploy.sh`

---

## 十二、常见问题排查

### Q1：容器启动后马上退出？

```bash
# 查看日志
docker compose -f docker-compose.prod.yml logs server

# 常见原因：
# 1. .env 文件不存在或路径不对 → 检查 .env 是否在项目根目录
# 2. ChromaDB 连接不上 → 检查 CHROMA_URL=http://chromadb:8000
# 3. API Key 无效 → 检查 DEEPSEEK_API_KEY 和 ZHIPU_API_KEY
# 4. 端口冲突 → 检查 3001 端口是否被占用
```

### Q2：上传文件 413 Request Entity Too Large？

```nginx
# Nginx 配置中增加：
client_max_body_size 60M;
```

### Q3：SSE 流式不工作，一直转圈？

```bash
# 检查 Nginx 是否配置了 SSE 支持：
# 1. proxy_buffering off;
# 2. proxy_set_header Connection '';
# 3. proxy_read_timeout 86400s;
# 参见第六章的 Nginx 配置
```

### Q4：HTTPS 证书过期？

acme.sh 会自动续期，但可以手动检查：
```bash
~/.acme.sh/acme.sh --renew -d yourdomain.com --force
```

### Q5：服务器重启后 Docker 容器没自动启动？

```bash
# 设置 Docker 开机自启
sudo systemctl enable docker

# 确保 compose 文件中有 restart: always
```

### Q6：国内服务器访问 DeepSeek/智谱 API 慢？

```bash
# 国内服务器通常访问这些 API 速度还可以
# 如果遇到慢的情况，检查服务器地域：
# - 阿里云/腾讯云一般没问题
# - 如果是海外的 API，考虑使用代理
```

---

## 十三、费用预估

### 月运行成本

| 项目 | 最低配置 | 推荐配置 | 说明 |
|------|---------|---------|------|
| **云服务器** | ¥50/月 (1核2G) | ¥95/月 (2核4G) | 腾讯云/阿里云轻量 |
| **域名** | ¥3/月 (¥35/年) | ¥3/月 | 首年便宜 |
| **DeepSeek API** | ¥0-20/月 | ¥50-100/月 | 取决于使用量 |
| **智谱 AI Embedding API** | ¥0-10/月 | ¥20-50/月 | 取决于文档量和查询量 |
| **合计** | **≈ ¥70/月** | **≈ ¥200/月** | 个人使用绰绰有余 |

### 省钱技巧

1. **新用户优惠**：阿里云/腾讯云新用户 1核2G 一年 ¥99
2. **DeepSeek API** 非常便宜，个人使用基本免费额度就够了
3. **按量付费**：如果不确定用量，先买按量付费的服务器体验
4. **学生优惠**：学生认证可以免费领服务器（阿里云/腾讯云都有学生计划）

---

## 附：快速部署命令速查表

```bash
# ─── 第一行（服务器初始化）───
ssh root@IP
apt update && apt upgrade -y
adduser deploy && usermod -aG sudo deploy
# 配置 SSH → 退出重新登录

# ─── 第二行（装环境）───
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
sudo apt install -y docker-compose-plugin nginx ufw

# ─── 第三行（防火墙）───
sudo ufw allow 2222 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable

# ─── 第四行（部署项目）───
git clone https://github.com/xxx/RAG-Knowledge-Base-Dialog-System.git /home/deploy/rag-system
cd /home/deploy/rag-system
cp packages/server/.env.example .env && chmod 600 .env && vim .env  # 填 API Key

# ─── 第五行（构建前端）───
cd packages/client && npm install && npm run build && cd ../..
sudo cp -r packages/client/dist/* /home/deploy/rag-system/client-dist/

# ─── 第六行（配置反向代理）───
# 配置 Nginx + SSL → 见第五、六章

# ─── 第七行（启动服务）───
docker compose -f docker-compose.prod.yml up -d

# ─── 验证 ───
curl https://yourdomain.com/api/health
```

---

> 💡 **最后提醒：**
>
> 1. **安全第一** — 先配置防火墙和 SSH，再暴露公网
> 2. **SSL 必配** — 没有 HTTPS 的网站会被浏览器标记"不安全"
> 3. **备份数据** — ChromaDB 数据丢了要重新 Embedding 所有文档，非常耗时
> 4. **监控要早** — 上线第一天就配好监控，别等出问题才想到
> 5. **迭代上线** — 不用等所有功能完美再上，核心能跑通了就上线，然后逐步完善
>
> **最后：别忘了在服务器上定期执行 `apt update && apt upgrade -y` 保持系统安全！**

---

*文档生成日期: 2026-05-20*
