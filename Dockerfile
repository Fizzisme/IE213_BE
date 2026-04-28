# ==============================
# STAGE 1: BUILD
# ==============================
FROM node:18-alpine AS builder

# Tạo thư mục làm việc trong container
WORKDIR /app

# Copy package.json và lock file trước để tận dụng cache
COPY package*.json ./

# Cài dependencies (bao gồm devDependencies)
RUN npm install

# Copy toàn bộ source code
COPY . .

# Build project (ví dụ dùng Babel hoặc TypeScript)
RUN npm run build


# ==============================
# STAGE 2: PRODUCTION
# ==============================
FROM node:18-alpine AS production

# Tạo thư mục làm việc
WORKDIR /app

# Copy package.json để cài lại dependencies cần thiết
COPY package*.json ./

# Chỉ cài dependencies cho production (nhẹ hơn)
RUN npm install --omit=dev

# Copy file build từ stage builder
COPY --from=builder /app/dist ./dist

# Copy các file cần thiết khác (nếu có)
COPY --from=builder /app/.env ./

# Expose port
EXPOSE 8080

# Command chạy app
CMD ["node", "dist/server.js"]