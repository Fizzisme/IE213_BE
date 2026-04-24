# 🦊 Hướng dẫn Tích hợp MetaMask & Blockchain (Sepolia)
## Pattern: Two-Phase Transaction (Prepare/Confirm)

Tài liệu này dành cho team Frontend để triển khai các chức năng tương tác với Blockchain (ví dụ: Duyệt bệnh nhân, Tạo Lab Order, Cấp quyền).

---

## 1. Khái niệm cốt lõi (Tư duy Web3)

Hệ thống sử dụng cơ chế **Non-custodial**. Nghĩa là:
- **Backend:** Chỉ đóng vai trò "người soạn thảo" giao dịch (Unsigned Transaction).
- **Frontend/MetaMask:** Đóng vai trò "người ký tên" và trả phí Gas (Signing & Broadcasting).
- **Mạng lưới:** Sepolia Testnet (Chain ID: `11155111` hoặc `0xaa36a7`).

---

## 2. Quy trình 3 bước triển khai

Bất kỳ chức năng nào có biểu tượng 🔗 (Blockchain) đều phải đi qua luồng sau:

### Bước 1: Lấy dữ liệu giao dịch (API Prepare)
Khi Admin/Bác sĩ bấm nút thực hiện, Frontend gọi API để lấy "Giao dịch thô".

```javascript
// Ví dụ: Duyệt Bệnh nhân
const res = await axios.post(`/v1/admins/users/${id}/approve/prepare`);

// Backend trả về object txRequest:
// { "to": "0x...", "data": "0x...", "chainId": "0xaa36a7", "nonce": 1, ... }
const { txRequest } = res.data;
```

### Bước 2: Ký & Gửi qua MetaMask
Dùng đối tượng `window.ethereum` có sẵn trong trình duyệt để yêu cầu người dùng xác nhận.

```javascript
async function signAndSend(txRequest) {
  try {
    // 1. Kiểm tra MetaMask có cài chưa
    if (!window.ethereum) throw new Error("Vui lòng cài đặt MetaMask");

    // 2. Yêu cầu chuyển mạng Sepolia nếu chưa đúng
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xaa36a7' }], 
    });

    // 3. Hiện popup ký xác nhận và gửi lên mạng lưới
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [txRequest],
    });

    return txHash; // Ví dụ: 0xabc123...
  } catch (error) {
    console.error("User từ chối hoặc lỗi ví:", error);
    throw error;
  }
}
```

### Bước 3: Xác nhận với Backend (API Confirm)
Sau khi có mã biên lai (`txHash`), Frontend phải gửi mã này về để Backend cập nhật Database.

```javascript
const txHash = await signAndSend(txRequest);

await axios.post(`/v1/admins/users/${id}/approve/confirm`, {
  txHash: txHash
});

alert("Giao dịch thành công và đã được ghi nhận!");
```

---

## 3. Quản lý trạng thái UI (Trải nghiệm người dùng)

Vì giao dịch trên Blockchain mất thời gian để "đào" (mine), Frontend cần xử lý Loading cẩn thận:

1.  **Giai đoạn 1 (Processing):** Hiển thị "Đang chuẩn bị dữ liệu..." (Lúc gọi API Prepare).
2.  **Giai đoạn 2 (Waiting for Sign):** Hiển thị "Vui lòng xác nhận trên ví MetaMask" (Lúc popup ví hiện ra).
3.  **Giai đoạn 3 (Verifying):** Hiển thị "Đang xác thực trên Blockchain... (có thể mất 15-30s)". Đây là lúc quan trọng nhất, đừng để người dùng tắt trình duyệt.
    - *Mẹo:* Cung cấp link xem giao dịch: `https://sepolia.etherscan.io/tx/${txHash}`.

---

## 4. Danh sách các API áp dụng luồng này

| Chức năng | Vai trò | Prepare API | Confirm API |
| :--- | :--- | :--- | :--- |
| Duyệt Bệnh nhân | Admin | `POST /v1/admins/users/:id/approve/prepare` | `POST /v1/admins/users/:id/approve/confirm` |
| Tạo Bác sĩ | Admin | `POST /v1/admins/users/create-doctor` | `POST /v1/admins/users/create-doctor/confirm` |
| Tạo Lab Order | Bác sĩ | `POST /v1/lab-orders` | `POST /v1/lab-orders/confirm` |
| Đồng ý xét nghiệm | Bệnh nhân | `PATCH /v1/lab-orders/:id/consent` | `PATCH /v1/lab-orders/:id/consent/confirm` |
| Trả kết quả Lab | Kỹ thuật viên | `PATCH /v1/lab-orders/:id/post-result` | `PATCH /v1/lab-orders/:id/post-result/confirm` |

---

## 5. Xử lý lỗi thường gặp

- **Error 4001:** Người dùng bấm "Reject" trên MetaMask $\rightarrow$ Frontend nên tắt loading và cho phép người dùng bấm lại nút.
- **Wrong Network:** Người dùng đang ở mạng Ethereum Mainnet hoặc Polygon $\rightarrow$ Frontend dùng code ở Bước 2 để tự động switch sang Sepolia.
- **Gas Limit Error:** Thường do ví không đủ tiền (Sepolia ETH) $\rightarrow$ Hướng dẫn người dùng đi xin ETH tại: `https://sepoliafaucet.com/`.

---
**Backend Team Support**
*Cập nhật lần cuối: April 2026*
