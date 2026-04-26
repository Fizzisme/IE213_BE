# Hướng dẫn chi tiết cho Frontend tích hợp API + MetaMask

Tài liệu này hướng dẫn team Frontend triển khai toàn bộ flow của hệ thống hiện tại, bao gồm gọi API, đọc đúng response wrapper của backend, kích hoạt MetaMask, gửi `txHash` về backend để verify, và tổ chức UI theo từng vai trò `PATIENT`, `DOCTOR`, `LAB_TECH`, `ADMIN`.

---

## 1. Mục tiêu của tài liệu

Frontend cần xử lý đúng 4 lớp việc cùng lúc:

- gọi API nghiệp vụ của backend
- đọc đúng payload thực tế do backend trả về
- gọi MetaMask bằng đúng `contractAddress`, `method`, `args`
- gọi API `verify-*` hoặc `verify-tx` để backend xác nhận giao dịch on-chain

Nếu chỉ ký MetaMask mà không gọi API verify, MongoDB sẽ không đồng bộ với Blockchain.

---

## 2. Những điều Frontend bắt buộc phải biết trước

## 2.1 Mạng blockchain bắt buộc

Hệ thống hiện tại đang kiểm tra giao dịch trên:

- `Sepolia Testnet`
- `chainId = 11155111`

Nếu người dùng ký trên mạng khác, backend sẽ từ chối ở middleware `chainCheck` hoặc ở bước verify transaction.

## 2.2 Backend đang dùng response wrapper

Phần lớn response thành công từ backend được bọc theo format:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "...": "payload thực tế"
  },
  "timestamp": "2026-04-26T...",
  "path": "/v1/...",
  "responseTime": "18 ms"
}
```

Vì vậy với `axios`, đa số trường hợp bạn sẽ đọc payload thật theo kiểu:

```ts
const response = await api.get('/some-endpoint')
const payload = response.data.data
```

## 2.3 Có một số endpoint trả payload lồng thêm `data`

Ví dụ `POST /v1/patients/appointments` hiện tại từ controller trả thêm một object dạng:

```json
{
  "message": "Đặt lịch thành công",
  "data": { "...appointment...": true },
  "blockchain": { "...": true }
}
```

Sau khi đi qua response wrapper, frontend sẽ nhận:

```ts
const payload = response.data.data
const appointment = payload.data
const blockchain = payload.blockchain
```

Để tránh nhầm, nên dùng helper normalize:

```ts
export const unwrapApi = <T = any>(response: any): T => response.data.data

export const unwrapBusinessData = <T = any>(payload: any): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data
  return payload
}
```

## 2.4 Login hiện đang dùng cookie HTTP-only

Các API login đang set:

- `accessToken`
- `refreshToken`

vào cookie `httpOnly`.

Vì vậy frontend browser nên cấu hình HTTP client:

```ts
import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
})
```

---

## 3. Chuẩn bị MetaMask ở phía Frontend

## 3.1 Provider / Signer với ethers v6

```ts
import { ethers } from 'ethers'

export const getBrowserProvider = async () => {
  if (!window.ethereum) throw new Error('MetaMask chưa được cài')
  const provider = new ethers.BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  return provider
}

export const getSigner = async () => {
  const provider = await getBrowserProvider()
  return provider.getSigner()
}
```

## 3.2 Bắt buộc switch sang Sepolia

```ts
const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7'

export const ensureSepolia = async () => {
  if (!window.ethereum) throw new Error('MetaMask chưa được cài')

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    })
  } catch (error: any) {
    if (error?.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: 'Sepolia Test Network',
            nativeCurrency: {
              name: 'SepoliaETH',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          },
        ],
      })
      return
    }
    throw error
  }
}
```

## 3.3 ABI cần có ở frontend

Frontend nên import ABI từ artifact của 3 contract:

- `IdentityManager`
- `DynamicAccessControl`
- `MedicalLedger`

Khuyến nghị:

- copy ABI từ backend/hardhat artifact sang frontend repo
- không hardcode selector thủ công
- contract address nên ưu tiên lấy từ `payload.blockchain.contractAddress`

## 3.4 Helper chung để ký transaction từ metadata backend

Backend hiện đã trả về object `blockchain` khá đầy đủ:

```json
{
  "contractAddress": "0x...",
  "method": "grantAccess",
  "args": ["0xDoctorWallet", 24],
  "message": "Vui lòng ký xác nhận..."
}
```

Frontend nên có helper dùng lại:

```ts
import { ethers } from 'ethers'
import { DynamicAccessControlAbi, MedicalLedgerAbi, IdentityManagerAbi } from './abis'

const resolveAbiByMethod = (method: string) => {
  if (['grantAccess', 'revokeAccess'].includes(method)) return DynamicAccessControlAbi
  if (['createRecord', 'appendTestResult', 'closeRecord'].includes(method)) return MedicalLedgerAbi
  if (['registerPatientGasless', 'registerStaff'].includes(method)) return IdentityManagerAbi
  throw new Error(`Không tìm thấy ABI cho method ${method}`)
}

export const signBlockchainAction = async (blockchain: {
  contractAddress: string
  method: string
  args: any[]
}) => {
  await ensureSepolia()
  const signer = await getSigner()
  const abi = resolveAbiByMethod(blockchain.method)
  const contract = new ethers.Contract(blockchain.contractAddress, abi, signer)

  const tx = await contract[blockchain.method](...blockchain.args)
  const receipt = await tx.wait()

  return {
    txHash: receipt.hash,
    receipt,
  }
}
```

---

## 4. Luồng đăng nhập bằng ví (`/v1/auth/login-by-wallet`)

> Backend hiện hỗ trợ cả 2 path:
>
> - `POST /v1/auth/login-by-wallet`
> - `POST /v1/auth/login/wallet`
>
> Khuyến nghị frontend dùng path mới: `login-by-wallet`.

## 4.1 Flow 2 bước

### Bước A - Lấy nonce

```http
POST /v1/auth/login-by-wallet
Content-Type: application/json

{
  "walletAddress": "0x123..."
}
```

Response thực tế:

```ts
const res = await api.post('/auth/login-by-wallet', { walletAddress })
const payload = res.data.data
const nonce = payload.nonce
```

### Bước B - Người dùng ký nonce bằng MetaMask

```ts
const signer = await getSigner()
const signature = await signer.signMessage(nonce)
```

### Bước C - Gửi lại chữ ký để login

```http
POST /v1/auth/login-by-wallet
Content-Type: application/json

{
  "walletAddress": "0x123...",
  "signature": "0xabc..."
}
```

Backend sẽ set cookie và trả thêm payload:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "role": "PATIENT",
  "status": "ACTIVE",
  "hasProfile": true
}
```

Frontend nên:

- tin vào cookie là chính
- dùng `role`, `status`, `hasProfile` để route user

## 4.2 Trường hợp user wallet đăng nhập lần đầu

Với bệnh nhân đăng ký qua wallet lần đầu, frontend nên yêu cầu ký thêm chữ ký onboarding:

```ts
const registrationMessage = 'REGISTER_ZUNI_PATIENT'
const registrationSignature = await signer.signMessage(registrationMessage)
```

Sau đó gửi kèm ở bước login phase 2:

```ts
await api.post('/auth/login-by-wallet', {
  walletAddress,
  signature,
  registrationSignature,
})
```

Backend sẽ lưu `registrationSignature` để Admin dùng ở bước onboarding gasless sau này.

---

## 5. Luồng Patient: Đặt lịch + cấp quyền hồ sơ

## 5.1 Tạo lịch

Endpoint:

- `POST /v1/patients/appointments`

Ví dụ body:

```json
{
  "doctorId": "661111111111111111111111",
  "serviceId": "662222222222222222222222",
  "appointmentDateTime": "2026-05-01T09:30:00.000Z",
  "description": "Mệt, khát nước nhiều"
}
```

Payload frontend đọc:

```ts
const res = await api.post('/patients/appointments', body)
const payload = res.data.data
const appointment = payload.data
const blockchain = payload.blockchain
```

`blockchain` hiện có dạng:

```json
{
  "action": "GRANT_ACCESS",
  "contractAddress": "0x...DynamicAccessControl",
  "method": "grantAccess",
  "args": ["0xDoctorWallet", 24],
  "doctorWallet": "0xDoctorWallet",
  "durationHours": 24,
  "message": "Vui lòng ký xác nhận cấp quyền xem hồ sơ cho Bác sĩ qua MetaMask"
}
```

## 5.2 Ký MetaMask ngay sau khi tạo lịch

```ts
if (blockchain) {
  const { txHash } = await signBlockchainAction(blockchain)

  await api.post(`/patients/appointments/${appointment._id}/verify-grant-access`, {
    txHash,
  })
}
```

## 5.3 Kết quả mong đợi sau verify

- appointment chuyển `PENDING -> CONFIRMED`
- doctor có quyền đọc hồ sơ bệnh nhân trên chain trong 24h

## 5.4 Nếu người dùng bỏ qua MetaMask

Nên xử lý UI như sau:

- hiển thị trạng thái lịch là `PENDING`
- cho nút `Tiếp tục cấp quyền`
- gọi lại endpoint:
  - `GET /v1/patients/appointments/:id/prepare-grant-access`

Sau đó ký lại từ metadata backend trả về.

---

## 6. Luồng Patient: Hủy lịch + thu hồi quyền truy cập

## 6.1 Hủy lịch

Endpoint:

- `PATCH /v1/patients/appointments/:id/cancel`

Payload đọc:

```ts
const res = await api.patch(`/patients/appointments/${appointmentId}/cancel`)
const payload = res.data.data
const appointment = payload.appointment
const blockchain = payload.blockchain
```

## 6.2 Nếu backend trả `blockchain`

Frontend phải mở MetaMask để gọi `revokeAccess`:

```ts
if (blockchain) {
  const { txHash } = await signBlockchainAction(blockchain)

  await api.post(`/patients/appointments/${appointmentId}/verify-revoke-access`, {
    txHash,
  })
}
```

## 6.3 Ký lại nếu người dùng bỏ dở

Dùng endpoint:

- `GET /v1/patients/appointments/:id/prepare-revoke-access`

---

## 7. Luồng Doctor: xem lịch khám

Endpoint:

- `GET /v1/doctors/appointments`

Mục đích frontend:

- render danh sách bệnh nhân đã đặt với bác sĩ hiện tại
- dẫn sang trang tạo bệnh án hoặc xem chi tiết hồ sơ

Frontend chỉ cần:

```ts
const res = await api.get('/doctors/appointments')
const appointments = res.data.data
```

---

## 8. Luồng Doctor: tạo hồ sơ bệnh án ban đầu

## 8.1 Tạo record off-chain

Endpoint:

- `POST /v1/doctors/patients/:patientId/medical-records`

Body ví dụ:

```json
{
  "type": "DIABETES_TEST",
  "note": "Bệnh nhân khát nước, tiểu nhiều, nghi tăng đường huyết"
}
```

Payload đọc:

```ts
const res = await api.post(`/doctors/patients/${patientId}/medical-records`, body)
const payload = res.data.data
```

Payload có dạng:

```json
{
  "message": "Hồ sơ đã được lưu, vui lòng xác nhận giao dịch trên MetaMask",
  "medicalRecordId": "...",
  "patientWallet": "0xPatientWallet",
  "recordHash": "0x...",
  "blockchain": {
    "contractAddress": "0x...MedicalLedger",
    "method": "createRecord",
    "args": ["medicalRecordId", "0xPatientWallet", "0xRecordHash"]
  }
}
```

## 8.2 Ký MetaMask bằng ví Doctor

```ts
const { txHash } = await signBlockchainAction(payload.blockchain)

await api.post(`/doctors/medical-records/${payload.medicalRecordId}/verify-tx`, {
  txHash,
})
```

## 8.3 Lưu ý quan trọng

Backend đang verify:

- đúng contract `MedicalLedger`
- đúng method `createRecord`
- đúng args `[medicalRecordId, patientWallet, recordHash]`
- đúng người ký là ví doctor hiện tại

Nghĩa là frontend **không được tự sửa args**.

---

## 9. Luồng Lab Tech: nhập kết quả xét nghiệm + AI + appendTestResult

## 9.1 Tạo test result off-chain

Endpoint:

- `POST /v1/lab-techs/medical-records/:medicalRecordId/test-results`

Body ví dụ:

```json
{
  "testType": "DIABETES_TEST",
  "rawData": {
    "pregnancies": 2,
    "glucose": 150,
    "bloodPressure": 85,
    "skinThickness": 20,
    "insulin": 90,
    "bmi": 31.2,
    "diabetesPedigreeFunction": 0.5
  }
}
```

Backend sẽ:

- lưu rawData
- gọi AI service
- gắn `aiAnalysis`
- cập nhật record sang `WAITING_RESULT`
- trả metadata để gọi `appendTestResult`

Payload đọc:

```ts
const res = await api.post(`/lab-techs/medical-records/${medicalRecordId}/test-results`, body)
const payload = res.data.data
```

Payload dạng:

```json
{
  "message": "Kết quả đã được lưu, vui lòng xác nhận giao dịch trên MetaMask",
  "testResultId": "...",
  "resultHash": "0x...",
  "blockchain": {
    "contractAddress": "0x...MedicalLedger",
    "method": "appendTestResult",
    "args": ["medicalRecordId", "0xResultHash"]
  }
}
```

## 9.2 Ký MetaMask bằng ví Lab Tech

```ts
const { txHash } = await signBlockchainAction(payload.blockchain)

await api.post(`/lab-techs/test-results/${payload.testResultId}/verify-tx`, {
  txHash,
})
```

## 9.3 Trạng thái sau verify

- `testResult.blockchainMetadata.isSynced = true`
- `medicalRecord.status = HAS_RESULT`
- `medicalRecord.blockchainMetadata.labTxHash = txHash`

---

## 10. Luồng Doctor: chẩn đoán cuối và đóng hồ sơ

## 10.1 Gọi API chẩn đoán

Endpoint:

- `PATCH /v1/doctors/medical-records/:medicalRecordId/diagnosis`

Body ví dụ:

```json
{
  "testResultId": "663333333333333333333333",
  "diagnosis": "Tiểu đường tuýp 2",
  "note": "Điều trị insulin và tái khám sau 2 tuần"
}
```

Payload đọc:

```ts
const res = await api.patch(`/doctors/medical-records/${medicalRecordId}/diagnosis`, body)
const payload = res.data.data
```

Payload dạng:

```json
{
  "message": "Chẩn đoán đã được lưu, vui lòng xác nhận giao dịch trên MetaMask",
  "medicalRecordId": "...",
  "diagnosisHash": "0x...",
  "blockchain": {
    "contractAddress": "0x...MedicalLedger",
    "method": "closeRecord",
    "args": ["medicalRecordId", "0xDiagnosisHash"]
  }
}
```

## 10.2 Ký `closeRecord`

```ts
const { txHash } = await signBlockchainAction(payload.blockchain)

await api.post(`/doctors/medical-records/${payload.medicalRecordId}/verify-tx`, {
  txHash,
})
```

## 10.3 Ràng buộc nghiệp vụ

Backend sẽ từ chối nếu record chưa ở trạng thái `HAS_RESULT`.

Vì vậy UI doctor nên:

- chỉ enable nút `Chẩn đoán` nếu record đang `HAS_RESULT`
- disable nếu record đang `CREATED`, `WAITING_RESULT`, `COMPLETE`

---

## 11. Luồng Admin: duyệt user + đưa user lên Blockchain

## 11.1 Duyệt off-chain trước

Endpoint:

- `PATCH /v1/admins/users/:id/approve`

Payload đọc:

```ts
const res = await api.patch(`/admins/users/${userId}/approve`)
const payload = res.data.data
```

Payload có thể giống:

```json
{
  "message": "Vui lòng xác nhận đăng ký vai trò trên MetaMask",
  "needsBlockchain": true,
  "role": "DOCTOR",
  "targetWallet": "0x...",
  "registrationSignature": null,
  "blockchain": {
    "contractAddress": "0x...IdentityManager",
    "method": "registerStaff",
    "args": ["0xTargetWallet", "2"]
  }
}
```

Hoặc với patient gasless:

```json
{
  "needsBlockchain": true,
  "role": "PATIENT",
  "targetWallet": "0x...",
  "registrationSignature": "0xSignature...",
  "blockchain": {
    "contractAddress": "0x...IdentityManager",
    "method": "registerPatientGasless",
    "args": ["0xTargetWallet", "0xRegistrationSignature"]
  }
}
```

Nếu `needsBlockchain = false` thì frontend không cần mở MetaMask nữa.

## 11.2 Admin ký MetaMask

```ts
if (payload.needsBlockchain && payload.blockchain) {
  const { txHash } = await signBlockchainAction(payload.blockchain)

  await api.post(`/admins/users/${userId}/verify-onboarding`, {
    txHash,
  })
}
```

## 11.3 Ai là người phải ký?

- Với `registerPatientGasless`: **Admin ký**, không phải patient
- Với `registerStaff`: **Admin ký**, không phải doctor/lab tech

Backend đang verify đúng ví admin hiện tại ở bước verify.

---

## 12. Luồng Integrity Check

Endpoint:

- `GET /v1/doctors/medical-records/:medicalRecordId/verify`

Payload đọc:

```ts
const res = await api.get(`/doctors/medical-records/${medicalRecordId}/verify`)
const payload = res.data.data
```

Ví dụ kết quả thành công:

```json
{
  "medicalRecordId": "...",
  "isValid": true,
  "status": "COMPLETE",
  "message": "Dữ liệu y tế khớp hoàn toàn với Blockchain (Source of Truth)"
}
```

Ví dụ fail:

```json
{
  "medicalRecordId": "...",
  "isValid": false,
  "failedAt": "HAS_RESULT",
  "status": "DIAGNOSED"
}
```

Frontend nên render:

- xanh: `isValid = true`
- đỏ: `isValid = false`
- hiển thị `failedAt` để biết dữ liệu lệch ở giai đoạn nào

---

## 13. Endpoint summary cho Frontend

| Vai trò | Endpoint | Mục đích | Có MetaMask không |
| --- | --- | --- | --- |
| Auth | `POST /v1/auth/login-by-wallet` | lấy nonce / verify chữ ký login | Có, ở bước ký nonce |
| Patient | `POST /v1/patients/appointments` | tạo lịch + lấy metadata grant | Có |
| Patient | `GET /v1/patients/appointments/:id/prepare-grant-access` | lấy lại metadata grant | Có |
| Patient | `POST /v1/patients/appointments/:id/verify-grant-access` | verify tx grant | Không ký ở đây, chỉ gửi `txHash` |
| Patient | `PATCH /v1/patients/appointments/:id/cancel` | hủy lịch + lấy metadata revoke | Có |
| Patient | `GET /v1/patients/appointments/:id/prepare-revoke-access` | lấy lại metadata revoke | Có |
| Patient | `POST /v1/patients/appointments/:id/verify-revoke-access` | verify tx revoke | Không ký ở đây |
| Doctor | `GET /v1/doctors/appointments` | lấy danh sách lịch | Không |
| Doctor | `POST /v1/doctors/patients/:patientId/medical-records` | tạo record + lấy metadata createRecord | Có |
| Doctor | `POST /v1/doctors/medical-records/:id/verify-tx` | verify createRecord/closeRecord | Không ký ở đây |
| Doctor | `PATCH /v1/doctors/medical-records/:id/diagnosis` | tạo diagnosisHash + metadata closeRecord | Có |
| Lab | `POST /v1/lab-techs/medical-records/:id/test-results` | tạo result + metadata appendTestResult | Có |
| Lab | `POST /v1/lab-techs/test-results/:id/verify-tx` | verify appendTestResult | Không ký ở đây |
| Admin | `PATCH /v1/admins/users/:id/approve` | approve local + metadata onboarding | Có thể có |
| Admin | `POST /v1/admins/users/:id/verify-onboarding` | verify onboarding/staff registration | Không ký ở đây |

---

## 14. Helper đề xuất cho Frontend project

## 14.1 Chuẩn hóa đọc payload backend

```ts
export const getPayload = <T = any>(response: any): T => response.data.data
```

## 14.2 Helper verify transaction

```ts
export const verifyBlockchainTx = async (url: string, txHash: string) => {
  return api.post(url, { txHash })
}
```

## 14.3 Helper full flow API -> MetaMask -> verify

```ts
export const runBackendBlockchainFlow = async ({
  request,
  verifyUrlBuilder,
  getBlockchainFromPayload,
  getEntityIdFromPayload,
}: {
  request: () => Promise<any>
  verifyUrlBuilder: (entityId: string) => string
  getBlockchainFromPayload: (payload: any) => any
  getEntityIdFromPayload: (payload: any) => string
}) => {
  const response = await request()
  const payload = getPayload(response)
  const blockchain = getBlockchainFromPayload(payload)

  if (!blockchain) return payload

  const { txHash } = await signBlockchainAction(blockchain)
  const entityId = getEntityIdFromPayload(payload)
  await verifyBlockchainTx(verifyUrlBuilder(entityId), txHash)

  return payload
}
```

---

## 15. Checklist UI/UX theo từng màn hình

## 15.1 Trang đăng nhập ví

- nút `Kết nối MetaMask`
- hiển thị địa chỉ ví hiện tại
- gọi nonce
- ký nonce
- gửi signature
- nếu login lần đầu patient, ký thêm `REGISTER_ZUNI_PATIENT`

## 15.2 Trang đặt lịch của bệnh nhân

- sau khi create appointment thành công, nếu có `blockchain` thì tự bật modal xác nhận MetaMask
- nếu user cancel MetaMask, giữ appointment ở `PENDING`
- hiển thị nút `Ký cấp quyền lại`

## 15.3 Trang chi tiết appointment của bệnh nhân

- nếu status `PENDING`: hiển thị nút `Grant access`
- nếu status `CONFIRMED`: hiển thị nút `Cancel appointment`
- sau khi cancel, nếu có `blockchain` thì yêu cầu ký revoke ngay

## 15.4 Trang làm việc của doctor

- list `GET /doctors/appointments`
- vào bệnh nhân -> tạo record
- nếu create record thành công nhưng MetaMask fail, giữ UI ở trạng thái `chờ ký lại`

## 15.5 Trang lab tech

- chỉ cho nhập kết quả khi record đang `CREATED`
- sau khi tạo result, bật MetaMask append result
- nếu bỏ dở verify, record sẽ ở `WAITING_RESULT`

## 15.6 Trang admin duyệt user

- sau approve, nếu `needsBlockchain = true` thì hiển thị CTA `Ký đưa user lên blockchain`
- admin phải dùng đúng ví admin đang liên kết với hệ thống

---

## 16. Những lỗi thường gặp và cách frontend nên xử lý

## 16.1 Sai mạng

Thông báo backend thường là:

- giao dịch không thuộc mạng Sepolia

Frontend nên:

- hiện toast `Vui lòng chuyển MetaMask sang Sepolia`
- gọi `ensureSepolia()` trước mọi thao tác blockchain

## 16.2 Người dùng bấm Reject / đóng MetaMask

Frontend nên:

- không coi flow hoàn tất
- lưu trạng thái local là `pending_signature`
- cho phép retry bằng endpoint `prepare-*` hoặc dùng lại `blockchain` metadata nếu còn phù hợp

## 16.3 TxHash đúng nhưng backend verify fail

Nguyên nhân thường là:

- ký sai ví
- gọi sai method
- gọi đúng method nhưng sai args
- tx gửi tới sai contract address

Do backend hiện đã verify rất chặt, frontend phải:

- dùng nguyên `contractAddress`, `method`, `args` từ backend
- không tự tái cấu trúc args
- không đổi thứ tự tham số

## 16.4 Cookie không đi kèm request

Kiểm tra:

- `withCredentials: true`
- backend CORS cho phép credentials
- frontend và backend chạy trên domain/port phù hợp

---

## 17. Khuyến nghị triển khai thực tế cho team Frontend

## 17.1 Không hardcode lại business args nếu backend đã trả `blockchain.args`

Ưu tiên:

- backend sinh args
- frontend chỉ thực thi đúng args đó

## 17.2 Mỗi flow blockchain nên có 4 trạng thái UI

- `idle`
- `awaiting_signature`
- `verifying_blockchain`
- `completed`

và thêm `failed` khi cần retry.

## 17.3 Luôn log `txHash`

Ở dev mode, nên log:

- endpoint đã gọi
- blockchain method
- args
- txHash
- verify endpoint

để dễ debug với backend.

---

## 18. Kết luận cho Frontend team

Để tích hợp hệ thống này đúng cách, frontend chỉ cần ghi nhớ nguyên tắc cốt lõi sau:

- gọi API nghiệp vụ trước
- lấy `payload = response.data.data`
- nếu payload có `blockchain` thì mở MetaMask bằng đúng metadata backend trả về
- lấy `txHash` và gọi endpoint verify tương ứng
- chỉ sau verify thành công mới coi flow blockchain là hoàn tất

Tài liệu này bám theo backend hiện tại, không phải bản mô tả lý tưởng. Nếu backend thay đổi response hoặc route sau này, frontend nên cập nhật theo code thực tế trước tiên.
