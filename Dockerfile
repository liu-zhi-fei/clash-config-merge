# 使用 Node.js 20 的官方基础镜像
FROM node:20-alpine

# 安装 pnpm
RUN npm install -g pnpm

# 创建并设置工作目录
WORKDIR /app

# 复制 package.json 和 pnpm-lock.yaml 文件
COPY package.json pnpm-lock.yaml ./

# 安装项目依赖
RUN pnpm install

# 复制剩余的项目文件到工作目录
COPY . .

# 如果使用 Prisma，生成 Prisma 客户端
RUN npx prisma generate

# 构建 Next.js 项目的生产版本
RUN pnpm build

# 应用将在 3000 端口运行，暴露该端口
EXPOSE 3000

# 启动已构建的 Next.js 应用
CMD ["pnpm", "start"]
