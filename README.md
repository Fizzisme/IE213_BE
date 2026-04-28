# IE213 Backend - EHR Web3 API

Backend cho hệ thống quản lý hồ sơ bệnh án điện tử tích hợp Blockchain.

Project sử dụng:

- Express.js
- MongoDB với Mongoose
- Babel để chạy mã nguồn ES module trong môi trường Node.js
- Swagger để sinh tài liệu API tại `/docs`
- Hardhat để deploy smart contract lên Sepolia

## Mục lục

- [1. Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
- [2. Cấu trúc chạy của project](#2-cấu-trúc-chạy-của-project)
- [3. Cài đặt local](#3-cài-đặt-local)
- [4. Biến môi trường cần cấu hình](#4-biến-môi-trường-cần-cấu-hình)
- [5. Chạy backend local](#5-chạy-backend-local)
- [6. Swagger API docs](#6-swagger-api-docs)
- [7. Build production](#7-build-production)
- [8. Chạy bằng Docker và Docker Compose](#8-chạy-bằng-docker-và-docker-compose)
- [9. GitHub Actions và quy trình deploy](#9-github-actions-và-quy-trình-deploy)
- [10. Deploy smart contract bằng Hardhat](#10-deploy-smart-contract-bằng-hardhat)
- [11. Tài liệu liên quan](#11-tài-liệu-liên-quan)
- [12. Lưu ý quan trọng của codebase hiện tại](#12-lưu-ý-quan-trọng-của-codebase-hiện-tại)

## 1. Yêu cầu hệ thống

- Node.js `>= 18.x`
- npm
- MongoDB instance hoặc MongoDB Atlas
- RPC endpoint cho Sepolia
- MetaMask nếu cần test các luồng ký giao dịch ở frontend

## 2. Cấu trúc chạy của project

Backend khởi động từ file:

```bash
src/server.js
```

Luồng chính khi chạy server:

- load biến môi trường từ `dotenv`
- kết nối MongoDB qua `src/config/mongodb.js`
- mount API tại prefix `/v1`
- mount Swagger UI tại `/docs`
- chạy cron job lịch hẹn

Một số route chính:

- `GET /` - endpoint test đơn giản
- `GET /docs` - Swagger UI
- `POST /v1/auth/*`
- `GET /v1/patients/*`
- `GET /v1/doctors/*`
- `GET /v1/lab-techs/*`
- `GET /v1/admins/*`

## 3. Cài đặt local

### Bước 1: clone repository

```bash
git clone <repo-url>
cd IE213_BE
```

### Bước 2: cài dependencies

```bash
npm install
```

## 4. Biến môi trường cần cấu hình

Project đọc biến môi trường trong `src/config/environment.js` và `hardhat.config.cjs`.

Bạn cần tạo file `.env` ở thư mục gốc project.

Ví dụ tối thiểu:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>
DATABASE_NAME=ie213

APP_HOST=localhost
APP_PORT=8017

ACCESS_TOKEN_SECRET_SIGNATURE=your_access_secret
ACCESS_TOKEN_LIFE=20m
REFRESH_TOKEN_SECRET_SIGNATURE=your_refresh_secret
REFRESH_TOKEN_LIFE=14d

BLOCKCHAIN_RPC_URL=https://sepolia.infura.io/v3/<project-id>
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<api-key>

IDENTITY_MANAGER_ADDRESS=0x...
DYNAMIC_ACCESS_CONTROL_ADDRESS=0x...
MEDICAL_LEDGER_ADDRESS=0x...

INITIAL_ADMIN_WALLET_ADDRESS=0x...
ETHERSCAN_API_KEY=<etherscan-api-key>

ADMIN_PRIVATE_KEY=<only-required-when-deploying-contracts>
```

### Ý nghĩa các biến chính

- `MONGODB_URI`
  - chuỗi kết nối MongoDB

- `DATABASE_NAME`
  - tên database MongoDB sẽ được dùng khi connect

- `APP_HOST`
  - host logic của app, hiện code fallback về `localhost`

- `APP_PORT`
  - cổng backend sử dụng, nếu không có sẽ mặc định `8017`

- `ACCESS_TOKEN_SECRET_SIGNATURE`
  - secret ký access token

- `ACCESS_TOKEN_LIFE`
  - thời gian sống của access token

- `REFRESH_TOKEN_SECRET_SIGNATURE`
  - secret ký refresh token

- `REFRESH_TOKEN_LIFE`
  - thời gian sống của refresh token

- `BLOCKCHAIN_RPC_URL`
  - RPC chính cho backend blockchain read/verify

- `SEPOLIA_RPC_URL`
  - RPC Sepolia dự phòng hoặc dùng cho Hardhat deploy

- `IDENTITY_MANAGER_ADDRESS`
  - địa chỉ smart contract `IdentityManager`

- `DYNAMIC_ACCESS_CONTROL_ADDRESS`
  - địa chỉ smart contract `DynamicAccessControl`

- `MEDICAL_LEDGER_ADDRESS`
  - địa chỉ smart contract `MedicalLedger`

- `INITIAL_ADMIN_WALLET_ADDRESS`
  - ví admin khởi tạo ban đầu

- `ETHERSCAN_API_KEY`
  - dùng khi verify contract hoặc tích hợp Etherscan

- `ADMIN_PRIVATE_KEY`
  - chỉ bắt buộc khi deploy contract bằng Hardhat

## 5. Chạy backend local

### Chạy chế độ development

```bash
npm run dev
```

Script này dùng:

```bash
nodemon --exec babel-node ./src/server.js
```

Sau khi chạy thành công:

- API base URL: `http://localhost:8017` hoặc `http://localhost:<APP_PORT>`
- Swagger UI: `http://localhost:8017/docs`

### Kiểm tra nhanh

Mở trình duyệt hoặc dùng curl:

```bash
curl http://localhost:8017/
```

## 6. Swagger API docs

Swagger được cấu hình trong:

```bash
src/config/swagger.js
```

Nguồn comment Swagger được lấy từ:

```bash
src/swagger/**/*.js
```

Sau khi server chạy, mở:

```bash
http://localhost:<APP_PORT>/docs
```

## 7. Build production

### Build mã nguồn

```bash
npm run build
```

Script build hiện tại:

```bash
npm run clean && npm run build-babel
```

Output hiện tại được tạo ra tại:

```bash
build/src
```

### Chạy production theo script hiện có

```bash
npm run production
```

Script này chạy:

```bash
node ./build/src/server.js
```

## 8. Chạy bằng Docker và Docker Compose

Repo hiện có sẵn:

- `Dockerfile`
- `docker-compose.yml`

### Chạy bằng Docker Compose

Tạo file `.env.production` trước, sau đó chạy:

```bash
docker compose up -d --build
```

Theo `docker-compose.yml` hiện tại:

- service name: `api`
- container name: `ehr_api_prod`
- port map: `1306:1306`
- env file: `.env.production`

### Dừng container

```bash
docker compose down
```

### Xem log

```bash
docker compose logs -f
```

## 9. GitHub Actions và quy trình deploy

Workflow hiện tại nằm ở:

```bash
.github/workflows/deploy.yml
```

Workflow này chạy khi:

- push vào nhánh `main`

Các bước deploy hiện tại:

- checkout source code
- SSH vào server remote bằng `appleboy/ssh-action`
- đi tới thư mục `/app/IE213_BE`
- `git pull origin main`
- `docker compose down`
- `docker compose up -d --build`
- `docker image prune -f`

### Secrets GitHub Actions cần có

- `REMOTE_HOST`
- `REMOTE_USER`
- `SSH_PRIVATE_KEY`

Điều này nghĩa là server deploy cần:

- đã clone sẵn repo vào `/app/IE213_BE`
- đã cài Docker và Docker Compose
- có sẵn file `.env.production`

## 10. Deploy smart contract bằng Hardhat

Project có cấu hình Hardhat tại:

```bash
hardhat.config.cjs
```

Network quan trọng đang dùng:

- `hardhat`
- `sepolia`

Script deploy contract:

```bash
scripts/deploy.cjs
```

Script này deploy 3 contract:

- `IdentityManager`
- `DynamicAccessControl`
- `MedicalLedger`

### Chạy deploy Sepolia

```bash
npx hardhat run scripts/deploy.cjs --network sepolia
```

Sau khi deploy, script sẽ:

- in địa chỉ contract ra terminal
- tạo file `deployment.json`
- gợi ý các biến `.env` cần cập nhật

Để deploy được, bạn cần ít nhất:

- `SEPOLIA_RPC_URL` hoặc `BLOCKCHAIN_RPC_URL`
- `ADMIN_PRIVATE_KEY`
- `ETHERSCAN_API_KEY` nếu muốn verify contract

## 11. Tài liệu liên quan

- `docs/DOCS_FRONTEND_API_WEB3_DETAILED.md`
- `docs/DOCS_SYSTEM_ARCHITECTURE_WEB3.md`

## 12. Lưu ý quan trọng của codebase hiện tại

README này được viết theo đúng trạng thái repo hiện tại, và có một vài điểm bạn nên biết:

### 1. Dockerfile đang lệch với output build hiện tại

`package.json` build ra thư mục:

```bash
build/src
```

nhưng `Dockerfile` hiện đang copy và chạy từ:

```bash
dist/server.js
```

Vì vậy, nếu chạy Docker theo trạng thái hiện tại mà chưa chỉnh Dockerfile hoặc script build, container có thể không start đúng.

### 2. Docker Compose healthcheck đang gọi `/health`

`docker-compose.yml` đang dùng healthcheck:

```bash
http://localhost:1306/health
```

nhưng backend hiện tại không khai báo route `/health` trong `src/server.js`, nên healthcheck có thể fail dù app vẫn chạy.

### 3. Cổng trong code và cổng trong Docker Compose cần đồng bộ

Trong code, app đọc cổng từ `APP_PORT`.

Trong `docker-compose.yml`, môi trường lại đang đặt `PORT=1306`.

Để container chạy ổn định, bạn nên đảm bảo `.env.production` có:

```env
APP_PORT=1306
```

### 4. Swagger server URL lấy theo `APP_PORT`

Swagger config hiện build `servers` dựa trên `APP_PORT`, nên nếu đổi cổng runtime, bạn cũng nên kiểm tra lại URL trong trang `/docs`.
