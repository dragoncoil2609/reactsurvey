# Xây Dựng Luồng CI/CD Cơ Bản Với GitHub Actions & EC2

Phần 1 này hướng dẫn cách triển khai một ứng dụng Web (gồm Frontend React và Backend Node.js) lên AWS EC2 bằng Docker, và thiết lập luồng CI/CD với GitHub Actions để tự động hóa quá trình đó.

*Lưu ý: Để bài hướng dẫn ngắn gọn và tập trung vào luồng CI/CD, máy ảo EC2 sẽ được tạo trong Default VPC. Trong thực tế, nên cấu hình VPC riêng để bảo mật hơn.*

---

## CI/CD là gì

- **CI (Continuous Integration - Tích hợp liên tục):** Là tự động hóa việc gộp code, build và chạy test thường xuyên mỗi khi có code mới đẩy lên nhánh chung.
- **CD (Continuous Delivery - Phân phối liên tục):** Tự động đưa ứng dụng đến trạng thái sẵn sàng phát hành, nhưng bước deploy lên Production cuối cùng vẫn cần **phê duyệt thủ công** (bấm nút).
- **CD (Continuous Deployment - Triển khai liên tục):** Mức cao hơn — mã nguồn vượt qua hết các vòng kiểm tra sẽ **tự động lên thẳng Production** mà không cần con người can thiệp.

## Tại sao cần CI/CD

- **Tính nhất quán (Consistency):** Mọi lần deploy đều chạy qua đúng một quy trình chuẩn, không có chuyện "máy anh chạy được, máy chủ không chạy".
- **Lưu vết (Audit trail):** Hệ thống ghi lại ai deploy bản nào, lúc mấy giờ, fail ở bước nào — dễ điều tra khi có sự cố.
- **Rollback nhanh:** Mỗi lần chạy pipeline là một snapshot. Khi bản mới lỗi, có thể quay về bản cũ chỉ bằng một thao tác.
- **Scale team:** CI tự động cấp luồng test riêng cho từng nhánh/PR, giúp nhiều người làm việc song song mà không giẫm lên nhau.

## Các stage chuẩn của pipeline

Một luồng CI/CD (Pipeline) chuẩn công nghiệp thường diễn ra theo chuỗi các giai đoạn sau:

```text
[Source] ──> [Build] ──> [Test] ──> [Quality Gate] ──> [Package] ──> [Deploy] ──> [Verify]
```

- **Source/Checkout:** Lấy mã nguồn mới nhất từ kho lưu trữ.
- **Build:** Biên dịch, đóng gói mã nguồn (compile, bundle...).
- **Test:** Chạy kiểm thử tự động (Unit Test, Integration Test).
- **Quality Gate:** Chốt chặn đánh giá chất lượng: độ phủ test, điểm bảo mật... Nếu không đạt ngưỡng, pipeline dừng ngay, không cho đi tiếp.
- **Package:** Đóng gói thành Artifact phát hành (Docker Image, file `.jar`, file `.zip`...).
- **Deploy:** Đưa Artifact lên môi trường đích (Staging, Production).
- **Verify:** Chạy Smoke test — gõ nhẹ vào server vừa deploy để xác nhận hệ thống thực sự sống.

## Thuật ngữ Github Actions

- **Workflow:** Một luồng CI/CD hoàn chỉnh (tương ứng với 1 file YAML).
- **Job:** Một cụm tác vụ trong workflow. (Ví dụ Job Build, Job Deploy).
- **Step:** Một bước nhỏ trong Job (ví dụ: gõ một lệnh bash).
- **Action:** Các công cụ có sẵn được cộng đồng viết để tái sử dụng (như action copy file, action đăng nhập docker).
  *Lưu ý: Bạn nên chỉ định rõ phiên bản (versioning) của action như `@v4` hoặc `@v1.0.3` thay vì dùng nhánh `@main` hoặc `@master`. Việc "chốt" phiên bản giúp pipeline hoạt động ổn định, tránh bị lỗi bất ngờ khi tác giả thư viện cập nhật code làm thay đổi cấu trúc.*
- **Runner:** Máy chủ (VM) đứng ra chạy các lệnh của bạn.
  - *Hosted runner:* Máy ảo do GitHub cung cấp sẵn (miễn phí).
  - *Self-hosted runner:* Máy chủ riêng do bạn tự cung cấp và gắn vào GitHub.
- **Event:** Sự kiện kích hoạt (trigger) workflow (như `push`, `pull_request`).
- **Secret:** Biến môi trường mã hóa (dùng chứa mật khẩu, API key, SSH key).
- **Artifact:** Sản phẩm sinh ra giữa chừng (như file nén `.zip`, file `.jar`) được lưu lại để tải về hoặc chuyển cho Job sau.
- **Environment:** Môi trường triển khai ảo (như `production`, `staging`) dùng để thiết lập lớp rào chắn phê duyệt (Reviewers).
- **Context Expression `${{ ... }}`:** Cú pháp để đọc giá trị động trong file YAML — ví dụ `${{ secrets.EC2_HOST }}` đọc Secret, `${{ github.sha }}` lấy mã commit hiện tại.
- **`needs:`** Khai báo thứ tự phụ thuộc giữa các Job. Job có `needs: build` sẽ chờ Job `build` chạy xong thành công mới bắt đầu.
- **`if:`** Điều kiện chạy có điều kiện — ví dụ `if: github.ref == 'refs/heads/main'` chỉ cho phép deploy khi push lên nhánh `main`.

> Tham khảo tài liệu: [Understanding GitHub Actions - GitHub Docs](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions)

## Test trong CI

Chạy CI mà không có Test đồng nghĩa với việc tự động hóa việc đưa lỗi (bug) lên Production. Test là chốt chặn (Quality Gate) quan trọng để đảm bảo mã nguồn trên nhánh chính luôn ổn định.
- **Lint / Static Analysis:** Quét lỗi cú pháp và vi phạm coding convention trước khi chạy bất cứ thứ gì (VD: ESLint cho JS).
- **Security Scan:** Kiểm tra các thư viện phụ thuộc có lỗ hổng bảo mật đã biết không (VD: `npm audit`, Trivy).
- **Unit Test:** Kiểm tra từng hàm nhỏ độc lập xem logic cốt lõi có đúng không.
- **Integration Test:** Đảm bảo các module khi ghép lại (hoặc khi gọi Database) vẫn giao tiếp chuẩn xác.
- **Smoke Test:** Sau khi Deploy, tự động gõ vào endpoint để xác nhận web đang sống (xem thêm phần Healthcheck ở dưới).

*Ví dụ YAML tích hợp chuỗi Test vào pipeline:*
```yaml
  test:
    name: Test & Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint    # Lint
      - run: npm audit       # Security scan
      - run: npm test        # Unit test
```

## Deploy strategies

Khi đẩy code mới lên Production, có các chiến lược deploy phổ biến:
- **Recreate:** Tắt toàn bộ hệ thống cũ, khởi động bản mới. Đơn giản nhất nhưng sẽ **có Downtime**. Đây là chiến lược bài thực hành này đang dùng.
- **Rolling Deployment:** Cập nhật từng máy chủ một, không có downtime.
- **Blue-Green Deployment:** Tạo môi trường mới (Green) chạy song song, test xong mới chuyển traffic sang. Không downtime, rollback dễ.
- **Canary Deployment:** Đưa bản mới cho 5% người dùng trước, nếu ổn thì mở rộng dần. Không downtime, ít rủi ro nhất.

---

## Case study: dựng pipeline đầu tiên

### Chuẩn bị Source Code (Thực hiện trên máy cá nhân)

Trước khi thao tác với server, mã nguồn dự án cần được cấu hình Docker và đẩy lên GitHub. Để tiết kiệm thời gian, có thể tham khảo trực tiếp source code mẫu đã được setup sẵn từ A-Z (đã bao gồm file `docker-compose.yml`, cấu hình Nginx proxy và kết nối DB bằng biến môi trường).

**Khuyến nghị về file `.dockerignore`:**
Một bước cực kỳ quan trọng trước khi tiến hành build mã nguồn bằng Docker là tạo file `.dockerignore`. Bạn cần liệt kê các thư mục như `node_modules/`, `.git/` vào file này để ngăn Docker đẩy hàng trăm MB rác vào Image. Điều này giúp quá trình build diễn ra siêu nhanh và tối ưu bộ nhớ máy chủ.

**Kho lưu trữ mã nguồn mẫu:**
https://github.com/dragoncoil2609/reactsurvey.git

![Chụp màn hình kho GitHub chứa mã nguồn mẫu đã chuẩn bị sẵn](./image_step/anh_1_github_repo.png)

### Chuẩn bị Server và Chạy thử (Thực hiện trên AWS EC2)

**1. Tạo máy ảo EC2**
Thao tác trên giao diện của AWS:
1. Đăng nhập AWS Console, vào dịch vụ **EC2** > chọn **Launch Instance**.
2. **OS**: Chọn **Ubuntu Server 22.04 LTS** (hoặc 24.04 LTS).
3. **Network**: Dùng Default VPC để có sẵn Public IP.
4. **Security Group**: Mở port `22` (để SSH) và port `80` (để truy cập Web).
   > **Lưu ý bảo mật:** Không mở port `22` cho `0.0.0.0/0` (toàn thế giới) ở môi trường thật. Chỉ cho phép IP cụ thể của bạn để tránh bị dò mật khẩu (brute-force).
5. Tạo và tải về máy một **Key Pair** (ví dụ: `my-key.pem`).

**2. Cài đặt Docker bằng Shell Script**
Mở terminal và SSH vào server vừa tạo bằng lệnh sau:
```bash
ssh -i /path/to/my-key.pem ubuntu@<PUBLIC_IP_CỦA_EC2>
```

![Giao diện Terminal khi vừa SSH thành công vào Ubuntu EC2](./image_step/anh_3_ssh_ec2.png)

Sử dụng đoạn script sau để tự động cài đặt Docker và Docker Compose:

Tạo file script:
```bash
mkdir tools && cd tools
mkdir docker && cd docker/
nano install-docker.sh
```

Copy/Paste nội dung này vào file:
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
# Pin version cụ thể để đảm bảo tính ổn định (reproducibility)
sudo curl -L "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker --version
docker compose version
```
*(Sử dụng tổ hợp phím Ctrl+O, Enter để lưu, rồi Ctrl+X để thoát).*

Chạy script cài đặt:
```bash
chmod +x install-docker.sh
bash install-docker.sh

# Cấp quyền cho user ubuntu:
sudo usermod -aG docker ubuntu
```
*(Lưu ý: Gõ lệnh `exit` để thoát SSH, sau đó SSH lại để quyền mới có tác dụng!)*

![Màn hình hiển thị phiên bản Docker & Docker Compose sau khi cài xong](./image_step/anh_4_docker_version.png)

**3. Chạy thử thủ công (Manual Deploy)**
*Nguyên tắc của DevOps: Luôn đảm bảo ứng dụng chạy được thủ công trước khi thiết lập CI/CD tự động.*

1. Clone source code từ kho GitHub về máy ảo EC2:
```bash
git clone https://github.com/your-username/your-repo-name.git ~/app
```
2. Di chuyển vào thư mục và khởi chạy dự án:
```bash
cd ~/app
docker compose up -d --build
```

![Màn hình terminal đang chạy tiến trình docker-compose build/pull image](./image_step/anh_5_docker_compose_build.png)

3. Mở trình duyệt, truy cập vào **Public IP** của EC2 để kiểm tra giao diện trang web.

![Chụp màn hình trang web đang hoạt động thực tế trên trình duyệt với thanh URL là IP của EC2](./image_step/anh_6_web_hoat_dong.png)

4. Sau khi xác nhận ứng dụng hoạt động ổn định, gõ lệnh sau để dừng ứng dụng và dọn dẹp môi trường cho GitHub Actions:
```bash
docker compose down
```

### Cấu hình CI/CD bằng GitHub Actions (Tự động hóa)

Khi mã nguồn và server đã sẵn sàng, tiến hành thiết lập luồng CI/CD tự động 3 bước: **Build -> Deploy -> Show Log**.
*(Lưu ý: Do tính chất nhập môn của bài lab, luồng Pipeline này tạm thời bỏ qua giai đoạn Test để tập trung vào triển khai cơ bản. Tuy nhiên, một bước "Show Log" được bổ sung ở cuối luồng nhằm hỗ trợ kiểm tra trạng thái và gỡ lỗi (debug) sau khi ứng dụng khởi chạy).*

**1. Thiết lập GitHub Secrets**
Mục đích: cung cấp thông tin xác thực để GitHub Actions có quyền SSH vào EC2.

Trên giao diện repo GitHub, vào **Settings > Secrets and variables > Actions** và thêm 3 biến bảo mật sau:
1. `EC2_HOST`: Địa chỉ IP Public của EC2.
2. `EC2_USERNAME`: `ubuntu`
3. `EC2_SSH_KEY`: Nội dung file `my-key.pem`.

![Giao diện trang Settings/Secrets trên GitHub với 3 biến đã được thêm](./image_step/anh_7_github_secrets.png)

> Tham khảo tài liệu: [Using secrets in GitHub Actions - GitHub Docs](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)

**2. Tạo Workflow File**
Tại máy tính cá nhân, tạo một file tên là `.github/workflows/deploy.yml` trong thư mục dự án:

```yaml
name: CI/CD Pipeline Docker

on:
  push:
    branches:
      - main # [TÙY CHỈNH] Thay bằng nhánh kích hoạt CI/CD của bạn (vd: master, dev)

jobs:
  # Bước 1: Kiểm tra xem source code có Build thành Docker Image thành công không
  build:
    name: 1. Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Kiểm tra Build dự án
        run: |
          echo "Thử build Docker Image để đảm bảo code không lỗi trước khi deploy..."
          # [TÙY CHỈNH] Lệnh build tương ứng với dự án
          docker compose build

  # Bước 2: Truyền tải mã nguồn sang Server và yêu cầu Docker khởi chạy
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
          host: ${{ secrets.EC2_HOST }}         # Khai báo IP Server trong GitHub Secrets
          username: ${{ secrets.EC2_USERNAME }} # Khai báo User (vd: ubuntu, root)
          key: ${{ secrets.EC2_SSH_KEY }}       # Khóa Private Key .pem
          source: "./*"
          target: "~/app"                       # [TÙY CHỈNH] Đường dẫn thư mục chứa code trên Server

      - name: Triển khai tự động bằng Docker Compose
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            # [TÙY CHỈNH] Di chuyển vào thư mục chứa dự án
            cd ~/app
            
            # Dừng các container cũ và khởi động lại với code mới (chạy ngầm)
            docker compose down
            docker compose up -d --build

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
            cd ~/app # [TÙY CHỈNH] Di chuyển vào thư mục chứa dự án
            echo "--- Danh sách Container đang chạy ---"
            docker ps
            
            echo "--- LOG HOẠT ĐỘNG ---"
            docker compose logs --tail=50

            echo "--- SMOKE TEST ---"
            sleep 5
            curl -f http://localhost:80 && echo "OK: Web đang sống!" || (echo "FAIL: Web không phản hồi!" && exit 1)
```

![Chụp màn hình code file deploy.yml trên VS Code](./image_step/anh_8_deploy_yml.png)

**3. Kết quả triển khai tự động**
Thực hiện commit file `deploy.yml` và push lên nhánh `main`. 
Mở tab **Actions** trên kho GitHub để kiểm tra. Quá trình sẽ tự động chạy nối tiếp 3 bước (Build, Deploy, Show log). 

![Giao diện tab Actions báo xanh lá cây "Success" của cả 3 bước workflow](./image_step/anh_9_github_actions_success.png)

### Kiểm chứng tính năng CI/CD tự động

Sau khi thiết lập thành công, bước tiếp theo là kiểm chứng tính năng tự động hóa bằng cách thực hiện một thay đổi nhỏ trên giao diện.

**1. Chỉnh sửa mã nguồn Frontend**
Mở file `frontend/src/App.jsx` trên máy tính cá nhân, tìm đến phần giao diện và sửa đổi một đoạn văn bản:

```jsx
// Tìm dòng chứa thẻ <h1> và sửa thành:
<h1>To-Do List (Đã tự động hóa CI/CD!)</h1>

// Hoặc chèn thêm một đoạn text thông báo bên dưới:
<p style={{ color: 'green', textAlign: 'center', fontWeight: 'bold' }}>
  Phiên bản mới nhất đã lên sóng tự động!
</p>
```

![Chụp màn hình VS Code vị trí vừa sửa file App.jsx](./image_step/anh_10_sua_code_fe.png)

**2. Đẩy code lên GitHub (Push)**
Thực hiện các lệnh Git để ghi nhận sự thay đổi và đẩy code:

```bash
git add frontend/src/App.jsx
git commit -m "Cập nhật giao diện: Thêm thông báo kiểm tra CI/CD"
git push
```
![cicd chạy](./image_step/anh_12_cicd.png)

**3. Kiểm tra kết quả triển khai tự động**
Chuyển sang tab **Actions** trên GitHub, bạn sẽ thấy một tiến trình mới đang tự động chạy. Đợi báo xanh, sau đó mở trình duyệt và truy cập lại vào **Public IP**. Giao diện mới với dòng chữ vừa sửa sẽ lập tức hiện ra!

![Chụp màn hình trình duyệt với giao diện web đã được cập nhật thành công](./image_step/anh_11_web_update_thanh_cong.png)

---

## Phân tích Pipeline thực tế theo 4 Stage chuẩn

Đối chiếu lại luồng `deploy.yml` ở Phần Case Study với khung lý thuyết, ta thấy:
- **Stage Source/Checkout:** Tương ứng với step `uses: actions/checkout@v4`.
- **Stage Build:** Tương ứng với step chạy lệnh `docker compose build`.
- **Stage Test:** Chưa được cấu hình (Pipeline cơ bản hiện chưa thiết lập bước chạy Unit Test).
- **Stage Deploy:** Tương ứng với Job Deploy, dùng SCP copy code và SSH để chạy `docker compose up`.

## Điểm hạn chế của pipeline cơ bản

Mặc dù đã hoàn thành mục tiêu tự động hóa, luồng này vẫn còn 5 điểm hạn chế. Part 2 sẽ giải quyết **3 hạn chế có thể áp dụng ngay** (tốc độ deploy, quá tải server, bảo mật key). Hai vấn đề còn lại (Downtime, Rollback tự động) cần kiến trúc phức tạp hơn như Kubernetes hoặc Blue-Green:
- **Gây gián đoạn dịch vụ (Downtime):** Mỗi lần Deploy, lệnh `docker compose down` sẽ làm ngưng toàn bộ dịch vụ cho đến khi quá trình build mới hoàn tất. Trải nghiệm người dùng sẽ bị gián đoạn.
- **Thiếu cơ chế quay lui (Rollback) tự động:** Code mới được build và ghi đè thẳng lên bản cũ. Nếu bản mới chứa lỗi nghiêm trọng làm hỏng hệ thống, việc quay về phiên bản ổn định trước đó khá khó khăn và thủ công.
- **Hiệu suất truyền tải thấp:** Việc sử dụng giao thức SCP để sao chép hàng trăm tệp tin mã nguồn nhỏ lẻ qua mạng gây lãng phí rất nhiều thời gian chờ đợi.
- **Nguy cơ quá tải Server:** Yêu cầu máy chủ EC2 cấu hình thấp (như `t2.micro`) tự thực hiện quá trình Build mã nguồn có thể dẫn đến tràn RAM (Out of Memory) và treo máy chủ.
- **Chưa có kiểm soát đồng thời (Concurrency):** Nếu hai lập trình viên cùng push mã nguồn vào nhánh main cùng một thời điểm, hai tiến trình triển khai sẽ chạy đè lên nhau, gây ra rủi ro xung đột dữ liệu.

*(Mời bạn chuyển sang Part 2 để tiếp tục nâng cấp hệ thống và giải quyết triệt để các vấn đề trên!)*
