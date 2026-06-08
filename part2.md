# Những Chỗ Tutorial GitHub Actions Hay Bỏ Qua

Phần 1 đã dựng thành công một luồng CI/CD cơ bản. Tuy nhiên, luồng cơ bản đó có thể gặp một số vấn đề rủi ro như: sập server do các tiến trình chạy đè lên nhau, nguy cơ lộ khóa bảo mật, và mất nhiều thời gian do tải nặng. Phần 2 này sẽ hướng dẫn cách khắc phục từng vấn đề một bằng các chiến lược DevOps nâng cao.

## Concurrency control

Khi nhiều lập trình viên cùng đẩy mã nguồn lên nhánh chính cùng một thời điểm, các tiến trình triển khai sẽ được kích hoạt và chạy song song (parallel). Điều này dẫn đến tình trạng hai tiến trình cùng cố gắng ghi đè lên máy chủ, gây xung đột cổng, khóa database (lock), và sụp đổ hệ thống. Khái niệm `concurrency` (Kiểm soát đồng thời) sinh ra để giải quyết bài toán này.

Hệ thống cung cấp cho ta hai cơ chế để kiểm soát: **Queue (Xếp hàng)** và **Cancel (Hủy bỏ)**. Bằng cách gom các tiến trình lại thông qua thuộc tính `group`, chúng ta đảm bảo chúng không chạy song song nữa.

**1. Cơ chế Queue (Hàng đợi)**
Nếu chỉ định nghĩa `group` mà không cấu hình gì thêm, GitHub Actions sẽ mặc định áp dụng luật xếp hàng. Mặc định hệ thống hàng đợi chỉ giữ 1 tiến trình ở trạng thái chờ (Pending), có thể cấu hình số lượng bằng thuộc tính `cancel-in-progress: false` (giữ tất cả) hoặc cấu hình `queue` mới theo tài liệu của GitHub.
- Nếu Tiến trình 1 đang chạy, Tiến trình 2 đi sau sẽ được đưa vào Queue chờ.
- Nhưng nếu Tiến trình 3 xuất hiện, nó sẽ thay thế Tiến trình 2 trong Queue để ưu tiên chạy trước. Khi Tiến trình 1 hoàn tất, Tiến trình 3 sẽ được bắt đầu.
Cơ chế này giúp tối ưu hóa thời gian: Khi Deploy, chúng ta chỉ cần cập nhật bản code mới nhất lên server, không cần phải chạy deploy cho các bản code đã cũ xen ngang.

**2. Cờ Cancel-in-progress (Hủy tức thì)**
Nếu không muốn Tiến trình 3 phải chờ đợi Tiến trình 1 chạy xong, có thể thêm cờ `cancel-in-progress: true`. Cờ này sẽ ra lệnh hủy tiến trình 1 đang chạy dở dang để dành tài nguyên cho Tiến trình 3 chạy ngay lập tức.

*Lưu ý quan trọng:* Cần cẩn trọng khi dùng `cancel-in-progress: true` ở giai đoạn **Deploy**. Nếu máy chủ đang sao chép tệp tin mà tiến trình bị hủy giữa chừng, hệ thống có thể bị hỏng hóc do nhận được mã nguồn chắp vá. An toàn nhất với luồng Deploy trực tiếp lên EC2 là dùng cơ chế Queue thay vì Cancel.

**(Thực hành) Mẹo cấu hình Group đa môi trường:**
Nhiều tài liệu hướng dẫn dùng `group: ${{ github.workflow }}` để ép mọi nhánh phải xếp chung một hàng đợi. Tuy nhiên, nếu luồng của bạn deploy mã nguồn từ nhánh `main` lên Production và nhánh `dev` lên Staging, việc gom chung một group sẽ vô tình khiến quá trình deploy Staging block luôn cả quá trình deploy Production (hoặc ngược lại). 

Cấu hình chuẩn nhất cho dự án đa môi trường là kèm thêm biến định vị đích đến:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ env.DEPLOY_TARGET }}
  cancel-in-progress: false
```

![Cấu hình chuẩn: group tách theo môi trường đích](./image_step/1_2_yml_after_fix.png)

> Tham khảo tài liệu: [Using concurrency - GitHub Docs](https://docs.github.com/en/actions/using-jobs/using-concurrency)

## Quy tắc nhánh đọc YAML

Ở các hệ thống cơ bản, pipeline thường chỉ lắng nghe sự kiện `push` hoặc `pull_request`. Nhưng thực tế, hệ sinh thái kích hoạt (trigger) của GitHub Actions đồ sộ hơn rất nhiều:
- **`schedule`:** Hẹn giờ chạy luồng theo cú pháp cron (ví dụ: quét bảo mật lúc 2h sáng).
- **`check_run` / `check_suite`:** Lắng nghe phản hồi từ các hệ thống đánh giá chất lượng mã nguồn (như SonarQube).
- **`branch_protection_rule`:** Chạy khi có người thay đổi luật bảo vệ nhánh.
- **`delete` / `discussion`:** Chạy tiến trình dọn dẹp khi có nhánh bị xóa, hoặc phát thông báo khi có bình luận mới.

*Quy tắc ngầm:* Sự kiện đẩy code (`push`) sẽ luôn đọc file YAML ở ngay nhánh vừa đẩy lên. Nhưng đối với các sự kiện "ngoại cảnh" (không gắn liền với một đoạn code cụ thể như `schedule`, `discussion`...), GitHub chỉ quét tìm file YAML ở **nhánh mặc định (`main`)**. 

**(Thực hành) Vấn đề với Cron job:**
Nhiều lập trình viên tạo nhánh `test-cron`, viết lịch hẹn giờ nhưng hệ thống không hoạt động.
![Lịch hẹn giờ không hoạt động trên nhánh phụ](./image_step/2_2_cron_not_running.png)
Lý do là GitHub không quét nhánh phụ để tìm lịch hẹn. Muốn lịch có hiệu lực thực tế, file YAML bắt buộc phải được merge vào nhánh `main`.

> Tham khảo tài liệu: [Events that trigger workflows - GitHub Docs](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)

## Họ workflow_*

Đây là bộ ba sự kiện (`dispatch` / `call` / `run`) chuyên dùng để liên kết các luồng làm việc lại với nhau, biến những file YAML rời rạc thành một chuỗi luồng phức tạp. Giống như quy tắc ở trên, file chứa các sự kiện này luôn phải được ký gửi ở nhánh `main`.

- **`workflow_dispatch`:** Sinh ra một nút bấm (Manual trigger) ngay trên giao diện web. Hỗ trợ truyền thêm các tham số (inputs) khi chạy thủ công.
  ![Nút bấm Run workflow và tùy chọn nhánh](./image_step/3_2_dispatch_button_appeared.png)

- **`workflow_call`:** Khai báo một file YAML là thư viện tái sử dụng (Reusable workflow). Giúp tránh lặp lại mã (copy-paste) cùng một kịch bản Deploy cho nhiều dự án.
  ![Mô hình file trung tâm được gọi lại bởi nhiều repo khác nhau](./image_step/3_4_workflow_call_diagram.png)

- **`workflow_run`:** Kích hoạt tự động luồng B ngay sau khi luồng A hoàn tất.
  **LƯU Ý CỰC KỲ QUAN TRỌNG (Gotcha):** Mặc định, luồng B được kích hoạt bởi `workflow_run` sẽ tự động checkout mã nguồn từ nhánh mặc định (`main`), chứ KHÔNG checkout bản code vừa mới kích hoạt nó ở luồng A. Điều này rất dễ dẫn đến lỗi Deploy nhầm mã nguồn cũ. Để sửa lỗi này, bạn phải ép Action checkout đúng bản SHA của upstream:
  ```yaml
      - name: Checkout đúng bản code vừa Test xong
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
  ```

> Tham khảo tài liệu: [Reusing workflows - GitHub Docs](https://docs.github.com/en/actions/using-workflows/reusing-workflows)

## Cache dependencies

Trong các dự án NodeJS hay ReactJS, mỗi lần chạy CI/CD là một lần máy chủ phải tốn thời gian chạy `npm install` để tải lại hàng trăm MB thư viện, gây lãng phí băng thông và thời gian. Cơ chế Cache nén toàn bộ thư viện tải được ở lần đầu và kéo lại cực nhanh ở các lần sau.

**Best Practice hiện đại:**
Ngày xưa, mọi người hay dùng thủ công `actions/cache`. Nhưng hiện tại, tiện ích thiết lập môi trường như `actions/setup-node` đã tích hợp sẵn cơ chế cache tối ưu nhất (hỗ trợ `restore-keys` tự động fallback nếu không tìm thấy chuỗi băm giống hệt). Việc cấu hình cực kỳ đơn giản:

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm' # Kích hoạt bộ máy Cache tự động thông minh
      - run: npm ci
```
Kết quả: Hệ thống tự lo việc tìm khóa và nén `node_modules` hoặc bộ đệm npm ẩn.

*(Ảnh minh họa: Lần chạy thứ hai - Tải nhanh từ kho Cache)*
![Lần chạy thứ hai - Cache hit](./image_step/cache_hit.png)

> Tham khảo tài liệu: [Caching dependencies to speed up workflows - GitHub Docs](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)

## Matrix strategy

Bất cứ khi nào bạn phải viết lặp lại một khối lệnh (chỉ khác nhau môi trường hoặc phiên bản), đó là lúc dùng đến Matrix. Thay vì copy file YAML ra làm nhiều bản dễ gây sai sót, Matrix tự động nhân bản cấu hình.

Một vài trường hợp thường áp dụng: Test đa hệ điều hành (Ubuntu, macOS), Build Docker đa kiến trúc (AMD64, ARM64), Deploy đa microservices.

**LƯU Ý (Gotcha về fail-fast):**
Mặc định, biến `fail-fast` của Matrix là `true`. Tức là nếu bạn nhân bản ra 10 tiến trình, chỉ cần 1 cái lỗi, 9 cái còn lại lập tức bị ngắt giữa chừng. Để xem trọn vẹn kết quả của toàn bộ ma trận, hãy đặt nó thành `false`.

```yaml
jobs:
  test_code:
    strategy:
      fail-fast: false # Tránh việc 1 node tèo kéo theo toàn bộ node khác
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [16, 18, 20]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Cài đặt NodeJS
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
```

*(Ảnh minh họa: Hệ thống tự động sinh ra 9 luồng chạy song song từ 1 cấu hình duy nhất)*
![Sức mạnh nhân bản của Matrix](./image_step/matrix_runs.png)

> Tham khảo tài liệu: [Using a matrix for your jobs - GitHub Docs](https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs)

## Docker Hub

Hạn chế lớn nhất ở Part 1 là việc dùng SCP copy từng file mã nguồn trực tiếp, khiến máy chủ EC2 phải vừa làm web server vừa kiêm nhiệm build server, dễ gây cạn kiệt tài nguyên (OOM).

Kiến trúc chuẩn DevOps yêu cầu tách bạch rõ ràng: GitHub Actions làm nhiệm vụ Build (Đóng gói Image) và Push lên kho Docker Hub. Máy chủ EC2 chỉ làm nhiệm vụ Pull (kéo Image) và chạy.

Hai lưu ý quan trọng khi cấu hình:
1. **Sử dụng Personal Access Token (PAT):** Không nên lưu Mật khẩu tài khoản Docker Hub vào GitHub Secrets. Hãy tạo một PAT để tăng tính bảo mật.
2. **Không lạm dụng tag `:latest`:** Việc dùng tag `:latest` sẽ vô hiệu hóa khả năng Rollback. Bắt buộc phải gắn thẻ bằng `${{ github.sha }}` để mỗi bản build có một định danh duy nhất.

**(Thực hành) Tối ưu hóa tốc độ với cấu trúc 2 Job:**
Tách luồng thành hai tiến trình rõ rệt. Mã nguồn (YAML Snippet) chuẩn để thiết lập Job Build & Push siêu tốc:

```yaml
  build-push:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Đăng nhập Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PAT }} # Sử dụng Token thay vì Mật khẩu

      - name: Setup Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build và Push Image với SHA Tag
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/my-app:${{ github.sha }},${{ secrets.DOCKER_USERNAME }}/my-app:latest
```

Lệnh SCP ở Job 2 (Deploy) giờ đây chỉ cần truyền qua duy nhất tệp `docker-compose.yml`, quá trình Deploy sẽ diễn ra gần như ngay lập tức và không bao giờ gây sập server.
![Luồng chạy nhanh chóng với 2 Job độc lập](./image_step/4_4_deploy_fast.png)

> Tham khảo tài liệu: [Publishing Docker images - GitHub Docs](https://docs.github.com/en/actions/publishing-packages/publishing-docker-images)

## permissions: block

Nguyên tắc "đặc quyền tối thiểu" (Least-Privilege) buộc chúng ta phải thu hẹp thẻ thông hành (`GITHUB_TOKEN`) mặc định.
Ở đầu file `.yml`, hãy giới hạn mọi quyền về trạng thái cấm hoặc chỉ đọc:
```yaml
permissions: read-all # Hoặc khắt khe hơn: permissions: {}
```
*(Ảnh minh họa: Tiến trình báo lỗi 403 Forbidden do bị tước quyền ghi)*
![Lỗi 403 do bị chặn quyền ghi](./image_step/5_1_permission_denied.png)

Sau đó, chỉ cấp quyền cần thiết ở cấp độ Job. (Ví dụ: Xin token OIDC).

> Tham khảo tài liệu: [Assigning permissions to jobs - GitHub Docs](https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs)

## OIDC cho AWS

Lưu trữ khóa tĩnh (như `AWS_ACCESS_KEY`) vào GitHub Secrets tiềm ẩn rủi ro lộ lọt khóa vĩnh viễn. Bảo mật hiện đại ưu tiên sử dụng OpenID Connect (OIDC). AWS sẽ cấp "Token ngắn hạn" có tuổi thọ vài phút để xác thực, kết thúc luồng Token sẽ tự hủy.

Cách cấu hình OIDC:
- **Tạo Identity Provider:** Trên AWS IAM, tạo một Identity Provider, nhập URL `token.actions.githubusercontent.com`. *Lưu ý: Phải điền chính xác Thumbprint của Github (ví dụ `6938fd4d98bab03faadb97b34396831e3780aea1` hoặc làm theo hướng dẫn trong tài liệu của AWS).*
- **Tạo IAM Role với Trust Policy:** Đây là bước khó nhất. Bạn phải cấu trúc một file JSON gán chặt quyền hạn để AWS chỉ cấp khóa nếu có người gọi từ repo của bạn và trên đúng nhánh `main`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:OWNER_NAME/REPO_NAME:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

- **Sử dụng action cấu hình:** Thêm quyền `id-token: write` ở cấp độ Job và truyền ARN Role vào step:
  ```yaml
  - name: Configure AWS credentials
    uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::111122223333:role/MyGitHubDeployRole
      aws-region: ap-southeast-1
  ```

*(Ảnh minh họa: Cấu hình OIDC thành công)*
![Cấu hình OIDC thành công](./image_step/6_oidc_success.png)

> Tham khảo tài liệu: [Configuring OpenID Connect in AWS - GitHub Docs](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)

## Environment Nâng Cao

Tính năng `environment` tạo ra các rào chắn kiểm duyệt để tránh tự động hóa quá đà lên Production. Không chỉ dừng lại ở Required Reviewers (Cần người duyệt), nó còn mang đến các cấu hình bảo mật chuyên sâu:
- **Wait timer:** Kể từ lúc bấm Duyệt (Approve), hệ thống vẫn bị hoãn lại thêm X phút rồi mới thực thi lệnh Deploy.
- **Branch restriction:** Ngăn chặn các nhánh phụ được deploy. Chỉ duy nhất nhánh `main` mới được phép đẩy lên môi trường Production.
- **Environment-scoped secrets:** Lưu trữ riêng biệt các biến Secrets (như thông tin Database) cho Staging và Production. Luồng Deploy ở môi trường nào chỉ được phép móc ra kho khóa của môi trường đó.

Cách gọi trong luồng:
```yaml
  deploy_to_ec2:
    environment: production
```

*(Ảnh minh họa: Luồng Deploy bị tạm dừng để chờ Reviewer duyệt)*
![Chờ duyệt Deploy](./image_step/7_environment_waiting.png)

> Tham khảo tài liệu: [Using environments for deployment - GitHub Docs](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)

## Tổng kết: Checklist áp dụng cho Pipeline

Sau khi nắm vững các kỹ thuật nâng cao, hãy dùng danh sách kiểm tra (checklist) này để rà soát lại và nâng cấp cho luồng CI/CD (Part 1) của bạn:

- [ ] Giới hạn chạy song song với `concurrency: group: ${{ github.workflow }}-${{ env.DEPLOY_TARGET }}`
- [ ] Thiết lập Cache tự động với `actions/setup-node@v4` (`cache: 'npm'`)
- [ ] Tách `deploy` thành 2 Job độc lập: Build Image lên Hub, và Kéo Image về EC2.
- [ ] Áp dụng Matrix Strategy với `fail-fast: false`.
- [ ] Chuyển đổi mật khẩu Docker Hub sang Personal Access Token (PAT).
- [ ] Gắn thẻ Image bằng `${{ github.sha }}` thay vì `:latest`.
- [ ] Thu hẹp `permissions` ở cấp độ Job thay vì dùng mặc định.
- [ ] Chuyển đổi từ `AWS_ACCESS_KEY` sang OIDC với Trust Policy `StringLike`.
- [ ] Thiết lập `environment` cho luồng Production để bật Wait timer & Reviewers.
