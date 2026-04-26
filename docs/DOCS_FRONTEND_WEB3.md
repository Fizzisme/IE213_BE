# HƯỚNG DẪN TÍCH HỢP WEB3 CHO FRONTEND (CẬP NHẬT)

Tài liệu này hướng dẫn lập trình viên Frontend triển khai các luồng giao dịch Blockchain mượt mà, khớp với logic "1-Transaction UX" của Backend.

## 1. Luồng Đặt lịch & Cấp quyền (Bệnh nhân)
Hệ thống yêu cầu Bệnh nhân chọn Bác sĩ khi đặt lịch và thực hiện cấp quyền (Grant Access) ngay lập tức.

**Frontend Workflow:**
1.  Gọi API: `POST /v1/patients/appointments` (Body: `{ doctorId, serviceId, appointmentDateTime, ... }`).
2.  Nhận phản hồi: Backend trả về thông tin lịch hẹn và object `blockchain`.
3.  **Kích hoạt MetaMask:** Nếu có `res.blockchain`, lập tức gọi Smart Contract.
4.  **Xác minh:** Sau khi giao dịch thành công, gửi `txHash` về API xác minh.

```javascript
// Code mẫu
const res = await api.post('/patients/appointments', appointmentData);

if (res.blockchain && res.blockchain.action === 'GRANT_ACCESS') {
    const { doctorWallet, durationHours } = res.blockchain;
    
    // Gọi hàm grantAccess trên Smart Contract DynamicAccessControl
    const contract = new ethers.Contract(ACCESS_CONTRACT_ADDR, ACCESS_ABI, signer);
    const tx = await contract.grantAccess(doctorWallet, durationHours);
    
    // Chờ giao dịch được mining
    const receipt = await tx.wait();
    
    // Gọi API báo cho Backend lưu txHash
    await api.post(`/patients/appointments/${res.data._id}/verify-grant-access`, {
        txHash: receipt.hash
    });
}
```

---

## 2. Luồng Hủy lịch & Thu hồi quyền (Bệnh nhân)
Tương tự như đặt lịch, khi hủy lịch, Frontend cần hỗ trợ Bệnh nhân thu hồi quyền xem hồ sơ của Bác sĩ đó ngay lập tức.

**Frontend Workflow:**
1.  Gọi API: `PATCH /v1/patients/appointments/:id/cancel`.
2.  Nhận phản hồi: Backend trả về `blockchain` metadata với `action: 'REVOKE_ACCESS'`.
3.  **Kích hoạt MetaMask:** Gọi hàm `revokeAccess(doctorWallet)`.
4.  **Xác minh:** Gửi `txHash` về API `verify-revoke-access`.

```javascript
const res = await api.patch(`/patients/appointments/${id}/cancel`);

if (res.blockchain && res.blockchain.action === 'REVOKE_ACCESS') {
    const contract = new ethers.Contract(ACCESS_CONTRACT_ADDR, ACCESS_ABI, signer);
    const tx = await contract.revokeAccess(res.blockchain.doctorWallet);
    const receipt = await tx.wait();
    
    await api.post(`/patients/appointments/${id}/verify-revoke-access`, {
        txHash: receipt.hash
    });
}
```

---

## 3. Luồng Hồ sơ bệnh án & Hash-Chaining (Bác sĩ & Lab Tech)
Đây là quy trình 3 giai đoạn để tạo nên chuỗi móc xích dữ liệu. **Lưu ý:** Bác sĩ không thể thực hiện giai đoạn 3 nếu giai đoạn 2 chưa hoàn thành.

### Giai đoạn 1: Bác sĩ tạo hồ sơ
1.  Gọi API: `POST /v1/doctors/patients/:patientId/medical-records`.
2.  Backend trả về `recordHash`.
3.  Frontend gọi `medicalLedger.createRecord(mongoId, patientWallet, recordHash)`.
4.  Gọi `POST /v1/doctors/medical-records/:id/verify-tx` để đồng bộ.

### Giai đoạn 2: Kỹ thuật viên (Lab Tech) trả kết quả
1.  Gọi API: `POST /v1/lab-techs/medical-records/:id/test-results`.
2.  Backend trả về `resultHash`.
3.  Frontend gọi `medicalLedger.appendTestResult(mongoId, resultHash)`.
4.  Gọi `POST /v1/lab-techs/test-results/:testResultId/verify-tx` để đồng bộ.

### Giai đoạn 3: Bác sĩ chốt chẩn đoán (Strict Flow)
1.  Gọi API: `PATCH /v1/doctors/medical-records/:id/diagnosis`. 
    *(Nếu hồ sơ chưa có kết quả xét nghiệm, API này sẽ trả về lỗi 400)*.
2.  Backend trả về `diagnosisHash`.
3.  Frontend gọi `medicalLedger.closeRecord(mongoId, diagnosisHash)`.
4.  Gọi API xác minh cuối cùng để đóng hồ sơ vĩnh viễn.

---

## 4. Kiểm tra tính toàn vẹn (Integrity Check)
Frontend nên cung cấp nút "Kiểm tra sự thật" cho Bệnh nhân ở trang chi tiết hồ sơ.

```javascript
const handleCheckIntegrity = async (recordId) => {
    // API này tự động băm dữ liệu trong DB và so khớp với Blockchain
    const res = await api.get(`/doctors/medical-records/${recordId}/verify`);
    
    if (res.isValid) {
        alert("Dữ liệu an toàn 100%!");
    } else {
        alert(`CẢNH BÁO: Dữ liệu bị sai lệch tại bước ${res.failedAt}`);
    }
}
```

## 5. Lưu ý về Provider (Ethers.js v6)
Sử dụng `BrowserProvider` để tương tác với MetaMask:
```javascript
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
```
Luôn kiểm tra `res.blockchain` trong mọi phản hồi API của module Appointment và MedicalRecord để kích hoạt luồng Web3 kịp thời.
