# Xây Dựng Luồng CI/CD Cơ Bản Với GitHub Actions & EC2

Để tối ưu hóa quy trình phát triển, chúng ta sẽ "đóng gói" một ứng dụng Web (gồm Frontend React và Backend Node.js) bằng Docker, đưa lên máy chủ AWS EC2, và thiết lập luồng CI/CD với GitHub Actions.

*Lưu ý: Để bài hướng dẫn ngắn gọn và tập trung vào luồng CI/CD, máy ảo EC2 sẽ được tạo trong Default VPC. Trong thực tế, nên cấu hình VPC riêng để bảo mật hơn.*

---

## CI/CD là gì

- **CI (Continuous Integration - Tích hợp liên tục):** Tự động hóa việc gộp code, build và chạy test thường xuyên mỗi khi có mã nguồn mới đẩy lên nhánh chung.
- **CD (Continuous Delivery - Phân phối liên tục):** Tự động hóa khâu đóng gói (Build Image, tạo Artifact) và chuẩn bị sẵn sàng. Quá trình Deploy ra môi trường Production vẫn cần sự phê duyệt và bấm nút thủ công (Manual trigger).
- **CD (Continuous Deployment - Triển khai liên tục):** Mức độ cao nhất, tự động hóa 100% việc đẩy mã nguồn thẳng ra môi trường Production mà không cần con người can thiệp.

## Tại sao cần CI/CD

- **Loại bỏ rủi ro thủ công:** Không còn tình trạng SSH vào server gõ lệnh bằng tay dễ sai sót.
- **Tính nhất quán (Consistency):** Đảm bảo mọi lần deploy đều tạo ra kết quả giống hệt nhau, không phụ thuộc vào máy cá nhân của lập trình viên.
- **Audit trail:** Lưu vết toàn bộ lịch sử (ai deploy, khi nào, mã nguồn thay đổi gì).
- **Rollback nhanh:** Khả năng quay lui về phiên bản ổn định trước đó trong vài phút.
- **Scale team:** Hỗ trợ nhiều lập trình viên làm việc song song (Parallel CI) trên các nhánh khác nhau mà không sợ giẫm chân lên nhau.

## Các stage chuẩn của pipeline

Một luồng CI/CD (Pipeline) chuẩn công nghiệp thường đi qua các chốt chặn (Quality Gate) nghiêm ngặt:

```text
[Source/Checkout] ──> [Build] ──> [Test] ──> [Package] ──> [Deploy] ──> [Verify]
```

- **Source/Checkout:** Lấy mã nguồn mới nhất từ kho lưu trữ.
- **Build:** Biên dịch mã nguồn (ví dụ: Compile Java, tsc Node.js).
- **Test:** Chạy kiểm thử tự động, quét bảo mật tĩnh (Static Analysis).
- **Package:** Đóng gói mã nguồn thành Artifact hoặc Docker Image để sẵn sàng triển khai.
- **Deploy:** Triển khai sản phẩm hoàn thiện lên Server.
- **Verify:** Smoke test (Kiểm tra nhanh xem ứng dụng có sống không sau khi deploy).

## Thuật ngữ Github Actions

- **Workflow:** Một luồng CI/CD hoàn chỉnh (tương ứng với 1 file YAML).
- **Job:** Một cụm tác vụ trong workflow. (Ví dụ Job Build, Job Deploy).
- **Step:** Một bước nhỏ trong Job (ví dụ: gõ một lệnh bash).
- **Action:** Các công cụ có sẵn được cộng đồng viết để tái sử dụng. *Lưu ý: Luôn chỉ định rõ phiên bản (versioning) của action như `@v4` thay vì dùng `@main` để hệ thống không gãy khi tác giả cập nhật thư viện.*
- **Cú pháp YAML:**
  - `${{ ... }}`: Context expression, dùng để nội suy biến môi trường, thông tin sự kiện, hoặc dữ liệu bí mật (secrets).
  - `needs: <job_id>`: Bắt buộc Job hiện tại phải chờ `<job_id>` hoàn thành thành công mới được chạy.
  - `if: <condition>`: Điều kiện kích hoạt, nếu đúng mới chạy Step/Job đó.
- **Environment:** Môi trường triển khai ảo (như `production`, `staging`) dùng để thiết lập lớp rào chắn phê duyệt (Reviewers).

> Tham khảo tài liệu: [Understanding GitHub Actions - GitHub Docs](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions)

## Test trong CI

Chạy CI mà không có Test đồng nghĩa với việc tự động hóa quá trình đưa lỗi lên Production. Test là chốt chặn (Quality Gate) quan trọng:
- **Lint/Static Analysis:** Kiểm tra cú pháp chuẩn (ESLint, Prettier) và quét lỗ hổng bảo mật gói tĩnh (Trivy, `npm audit`).
- **Unit/Integration Test:** Kiểm tra logic nội bộ của code.
- **Smoke Test:** Ping thử vào đường dẫn web sau khi deploy xem có HTTP 200 không.

*Ví dụ một Step Test đơn giản trong YAML:*
```yaml
      - name: Quét bảo mật và chạy Test
        run: |
          npm audit
          npm run lint
          npm test
```

## Deploy strategies

Khi đẩy code mới lên Production, chúng ta có các chiến lược triển khai:
- **Recreate (Có Downtime):** Dừng toàn bộ hệ thống cũ, xóa đi và khởi chạy hệ thống mới. Nhanh, gọn nhưng gây gián đoạn dịch vụ. Đây chính là chiến lược mà bài lab này sử dụng.
- **Rolling Deployment:** Cập nhật từ từ từng máy chủ một (Không downtime).
- **Blue-Green Deployment:** Khởi tạo môi trường mới (Green) song song với cũ (Blue), test mượt rồi mới chuyển Traffic sang. Rất an toàn, dễ rollback tức thì.

---

## Case study: dựng pipeline đầu tiên

### Chuẩn bị Source Code (Thực hiện trên máy cá nhân)

Để tiết kiệm thời gian, có thể sử dụng source code mẫu đã được setup sẵn (bao gồm `docker-compose.yml`, Nginx proxy).

**Khuyến nghị về file `.dockerignore`:**
Một bước cực kỳ quan trọng trước khi tiến hành build mã nguồn bằng Docker là tạo file `.dockerignore`. Bạn cần liệt kê các thư mục như `node_modules/`, `.git/` vào file này để ngăn Docker đẩy hàng trăm MB rác vào Image, tối ưu RAM cho máy chủ.

**Kho lưu trữ mã nguồn mẫu:**
https://github.com/dragoncoil2609/reactsurvey.git

![Chụp màn hình kho GitHub chứa mã nguồn mẫu đã chuẩn bị sẵn](./image_step/anh_1_github_repo.png)

### Chuẩn bị Server và Chạy thử (Thực hiện trên AWS EC2)

**1. Tạo máy ảo EC2**
1. Đăng nhập AWS Console, vào dịch vụ **EC2** > chọn **Launch Instance**.
2. **OS**: Chọn **Ubuntu Server 22.04 LTS**.
3. **Network**: Dùng Default VPC để có sẵn Public IP.
4. **Security Group**: Mở port `80` (để truy cập Web). **Lưu ý đỏ:** Cổng `22` (SSH) tuyệt đối không nên mở công khai `0.0.0.0/0` ra toàn bộ Internet để tránh bị dò mật khẩu (Brute-force). Hãy chỉ giới hạn IP `22` cho `My IP` hoặc dải IP VPN nội bộ của bạn.
5. Tạo và tải về máy một **Key Pair** (`my-key.pem`).

**2. Cài đặt Docker bằng Shell Script**
SSH vào server:
```bash
ssh -i /path/to/my-key.pem ubuntu@<PUBLIC_IP_CỦA_EC2>
```

Tạo file script cài đặt:
```bash
mkdir tools && cd tools
nano install-docker.sh
```

Nội dung file (Đã chốt cứng version V2 của Docker Compose để đảm bảo Reproducibility):
```bash
#!/bin/bash
sudo apt update
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce
sudo systemctl start docker
sudo systemctl enable docker
sudo curl -L "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
# Tạo symlink để có lệnh 'docker compose' (V2 format)
sudo ln -s /usr/local/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose
docker --version
docker compose version
```

Chạy script cài đặt:
```bash
chmod +x install-docker.sh
bash install-docker.sh
sudo usermod -aG docker ubuntu
```
*(Gõ `exit` để thoát SSH, sau đó SSH lại để quyền mới có tác dụng).*

**3. Chạy thử thủ công (Manual Deploy)**
*Nguyên tắc DevOps: Luôn đảm bảo ứng dụng chạy được thủ công trước khi tự động hóa.*

1. Clone source code:
```bash
git clone https://github.com/your-username/your-repo-name.git ~/app
```
2. Khởi chạy:
```bash
cd ~/app
docker compose up -d --build
```
3. Mở trình duyệt truy cập Public IP để kiểm tra giao diện.
4. Dọn dẹp:
```bash
docker compose down
```

### Cấu hình CI/CD bằng GitHub Actions (Tự động hóa)

**1. Thiết lập GitHub Secrets**
Trên giao diện repo GitHub, vào **Settings > Secrets and variables > Actions** và thêm 3 biến bảo mật để Action có quyền SSH vào máy chủ:
1. `EC2_HOST`: Địa chỉ IP Public của EC2.
2. `EC2_USERNAME`: `ubuntu`
3. `EC2_SSH_KEY`: Nội dung file `my-key.pem`.

> Tham khảo tài liệu: [Using secrets in GitHub Actions - GitHub Docs](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)

**2. Tạo Workflow File**
Tạo file `.github/workflows/deploy.yml`:

```yaml
name: CI/CD Pipeline Docker

on:
  push:
    branches:
      - main

jobs:
  build:
    name: 1. Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Kiểm tra Build dự án
        run: |
          docker compose build

  deploy:
    name: 2. Deploy
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Copy source code lên Server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          source: "./*"
          target: "~/app"

      - name: Triển khai tự động
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/app
            # Recreate Strategy: Dừng container cũ, build và chạy mới
            docker compose down
            docker compose up -d --build

  verify:
    name: 3. Verify / Smoke Test
    runs-on: ubuntu-latest
    needs: deploy
    steps:
      - name: Kiểm tra Healthcheck
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            echo "Đợi ứng dụng khởi động..."
            sleep 10
            echo "Smoke test trang chủ:"
            curl -f http://localhost:80 || exit 1
            echo "Triển khai thành công, ứng dụng đang sống!"
```

**3. Kiểm chứng tính năng CI/CD tự động**
1. Sửa đoạn văn bản trong `frontend/src/App.jsx`:
```jsx
<h1>To-Do List (Đã tự động hóa CI/CD!)</h1>
```
2. Đẩy code lên GitHub (`git push`).
3. Đợi Action báo Success, F5 lại trình duyệt để xem thành quả tự động.

---

## Điểm hạn chế của pipeline cơ bản

Mặc dù đã hoàn thành mục tiêu tự động hóa, nhưng luồng triển khai cơ bản trên vẫn tồn tại các điểm hạn chế cần cải thiện:
- **Gây gián đoạn dịch vụ (Downtime):** Lệnh `docker compose down` sẽ làm ngưng toàn bộ dịch vụ cho đến khi quá trình build mới hoàn tất.
- **Thiếu cơ chế quay lui (Rollback) tự động:** Ghi đè thẳng lên bản cũ khiến việc quay lại phiên bản trước đó rất rủi ro.
- **Hiệu suất truyền tải thấp:** Giao thức SCP sao chép mã nguồn thô tốn nhiều thời gian.
- **Nguy cơ quá tải Server:** Yêu cầu máy chủ EC2 tự thực hiện Build mã nguồn dễ gây tràn RAM.
- **Chưa có kiểm soát đồng thời (Concurrency):** Hai tiến trình chạy song song có thể làm hỏng mã nguồn.

*(Part 2 sẽ tiếp tục nâng cấp hệ thống để giải quyết 3 vấn đề về hiệu suất, quá tải Server và Concurrency. Riêng bài toán triệt tiêu Downtime và Rollback tự động cần tới kỹ thuật nâng cao hơn như Kubernetes hay Blue-Green deployment, nằm ngoài phạm vi của luồng cơ bản này).*
