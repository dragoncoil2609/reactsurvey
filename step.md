# Hướng dẫn Toàn tập: Triển khai Ứng dụng Web lên AWS EC2 bằng Docker và Thiết lập CI/CD với GitHub Actions

Bài viết này hướng dẫn chi tiết cách "đóng gói" một ứng dụng Web (gồm Frontend React và Backend Node.js) bằng Docker, sau đó đưa lên máy chủ AWS EC2. Cuối cùng, thiết lập một luồng CI/CD với GitHub Actions để tự động hóa hoàn toàn quá trình triển khai.

*Lưu ý: Để bài hướng dẫn ngắn gọn và tập trung vào luồng CI/CD, máy ảo EC2 sẽ được tạo trong Default VPC. Trong thực tế, nên cấu hình VPC riêng để bảo mật hơn.*

---

## Phần 1: Chuẩn bị Source Code (Thực hiện trên máy cá nhân)

Trước khi thao tác với server, mã nguồn dự án cần được cấu hình Docker và đẩy lên GitHub. Để tiết kiệm thời gian, có thể tham khảo trực tiếp source code mẫu đã được setup sẵn từ A-Z (đã bao gồm file `docker-compose.yml`, cấu hình Nginx proxy và kết nối DB bằng biến môi trường).

**Kho lưu trữ mã nguồn mẫu:**
https://github.com/dragoncoil2609/reactsurvey.git

![Chụp màn hình kho GitHub chứa mã nguồn mẫu đã chuẩn bị sẵn](./image_step/anh_1_github_repo.png)

---

## Phần 2: Chuẩn bị Server và Chạy thử (Thực hiện trên AWS EC2)

### Bước 2.1: Tạo máy ảo EC2
Thao tác trên giao diện của AWS:

1. Đăng nhập AWS Console, vào dịch vụ **EC2** > chọn **Launch Instance**.
2. **OS**: Chọn **Ubuntu Server 22.04 LTS** (hoặc 24.04 LTS).
3. **Network**: Dùng Default VPC để có sẵn Public IP.
4. **Security Group**: Mở port `22` (để SSH) và port `80` (để truy cập Web).
5. Tạo và tải về máy một **Key Pair** (ví dụ: `my-key.pem`).


### Bước 2.2: Cài đặt Docker bằng Shell Script
Mở terminal và SSH vào server vừa tạo bằng lệnh sau:
```bash
ssh -i /path/to/my-key.pem ubuntu@<PUBLIC_IP_CỦA_EC2>
```

![Giao diện Terminal khi vừa SSH thành công vào Ubuntu EC2](./image_step/anh_3_ssh_ec2.png)

Sử dụng đoạn script sau để tự động cài đặt Docker và Docker Compose:

**1. Tạo file script:**
```bash
mkdir tools && cd tools
mkdir docker && cd docker/
nano install-docker.sh
```

**2. Copy/Paste nội dung này vào file:**
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
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker --version
docker-compose --version
```
*(Sử dụng tổ hợp phím Ctrl+O, Enter để lưu, rồi Ctrl+X để thoát).*

**3. Chạy script cài đặt:**
```bash
chmod +x install-docker.sh
bash install-docker.sh

# Cấp quyền cho user ubuntu:
sudo usermod -aG docker ubuntu
```
*(Lưu ý: Gõ lệnh `exit` để thoát SSH, sau đó SSH lại để quyền mới có tác dụng!)*

![Màn hình hiển thị phiên bản Docker & Docker Compose sau khi cài xong](./image_step/anh_4_docker_version.png)

### Bước 2.3: Chạy thử thủ công (Manual Deploy)
*Nguyên tắc của DevOps: Luôn đảm bảo ứng dụng chạy được thủ công trước khi thiết lập CI/CD tự động.*

1. Clone source code từ kho GitHub về máy ảo EC2:
```bash
git clone https://github.com/your-username/your-repo-name.git ~/app
```
2. Di chuyển vào thư mục và khởi chạy dự án:
```bash
cd ~/app
docker-compose up -d --build
```

![Màn hình terminal đang chạy tiến trình docker-compose build/pull image](./image_step/anh_5_docker_compose_build.png)

3. Mở trình duyệt, truy cập vào **Public IP** của EC2 để kiểm tra giao diện trang web.

![Chụp màn hình trang web đang hoạt động thực tế trên trình duyệt với thanh URL là IP của EC2](./image_step/anh_6_web_hoat_dong.png)

4. Sau khi xác nhận ứng dụng hoạt động ổn định, gõ lệnh sau để dừng ứng dụng và dọn dẹp môi trường cho GitHub Actions:
```bash
docker-compose down
```

---

## Phần 3: Cấu hình CI/CD bằng GitHub Actions (Tự động hóa)

Khi mã nguồn và server đã sẵn sàng, tiến hành thiết lập luồng CI/CD tự động 3 bước: **Build -> Deploy -> Show Log**.

### Bước 3.1: Thiết lập GitHub Secrets
*Giải thích: Mục đích của bước này là cung cấp thông tin xác thực để môi trường GitHub Actions có quyền kết nối vào máy chủ EC2. Việc lưu trữ thông tin trong hệ thống Secrets giúp bảo vệ địa chỉ IP và khóa SSH, ngăn chặn rò rỉ thông tin nhạy cảm công khai trên kho mã nguồn.*

Trên giao diện repo GitHub, vào **Settings > Secrets and variables > Actions** và thêm 3 biến bảo mật sau:
1. `EC2_HOST`: Địa chỉ IP Public của EC2.
2. `EC2_USERNAME`: `ubuntu`
3. `EC2_SSH_KEY`: Nội dung file `my-key.pem`.

![Giao diện trang Settings/Secrets trên GitHub với 3 biến đã được thêm](./image_step/anh_7_github_secrets.png)

### Bước 3.2: Tạo Workflow File
*Giải thích: File YAML này đóng vai trò là kịch bản (pipeline) chỉ đạo GitHub thực hiện chuỗi 3 công việc (jobs) một cách tuần tự mỗi khi có thay đổi trên nhánh `main`:*
*- **Build**: Kiểm tra thử việc đóng gói Docker Image để đảm bảo mã nguồn không bị hỏng trước khi đưa lên server thực tế.*
*- **Deploy**: Tự động sao chép mã nguồn mới sang máy ảo EC2 qua giao thức SCP, sau đó gửi lệnh SSH để yêu cầu Docker Compose khởi động lại hệ thống với phiên bản mới nhất.*
*- **Show log**: In trạng thái hoạt động của các container ra màn hình giao diện GitHub để người quản trị dễ dàng giám sát.*

Tại máy tính cá nhân, tạo một file tên là `.github/workflows/deploy.yml` trong thư mục dự án:

```yaml
name: CI/CD Pipeline Docker

on:
  push:
    branches:
      - main

jobs:
  # Bước 1: Kiểm tra xem source code có Build thành Docker Image thành công không
  build:
    name: 1. Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Kiểm tra Build Frontend & Backend
        run: |
          echo "Thử build Docker Image để đảm bảo code không lỗi trước khi deploy..."
          docker-compose build

  # Bước 2: Bắn code sang EC2 và yêu cầu Docker khởi chạy
  deploy:
    name: 2. Deploy
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Copy source code lên EC2
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          source: "./*"
          target: "~/app"

      - name: Triển khai bằng Docker Compose
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/app
            # Dừng các container cũ và khởi động lại với code mới (chạy ngầm)
            docker-compose down
            docker-compose up -d --build

  # Bước 3: Kiểm tra trạng thái các Container
  show_log:
    name: 3. Test / Show log
    runs-on: ubuntu-latest
    needs: deploy
    steps:
      - name: In log trạng thái
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/app
            echo "--- Danh sách Container đang chạy ---"
            docker ps
            
            echo "--- LOG CỦA BACKEND VÀ FRONTEND ---"
            docker-compose logs --tail=50
```

![Chụp màn hình code file deploy.yml trên VS Code](./image_step/anh_8_deploy_yml.png)

### Bước 3.3: Kết quả triển khai tự động
*Giải thích: Bước này đóng vai trò kích hoạt chu trình CI/CD vừa thiết lập. Thông qua tab Actions, người quản trị có thể giám sát toàn bộ quá trình tự động hóa theo thời gian thực (real-time) mà không cần phải đăng nhập trực tiếp vào máy chủ EC2.*

Thực hiện commit file `deploy.yml` và push lên nhánh `main`. 

Mở tab **Actions** trên kho GitHub để kiểm tra. Quá trình sẽ tự động chạy nối tiếp 3 bước (Build, Deploy, Show log). 

![Giao diện tab Actions báo xanh lá cây "Success" của cả 3 bước workflow](./image_step/anh_9_github_actions_success.png)

Từ bây giờ, mỗi khi có code mới được Push lên nhánh main, ứng dụng sẽ tự động được triển khai lên máy chủ EC2. Quá trình CI/CD hoàn tất!
