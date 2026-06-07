# Hướng dẫn Toàn tập: Tối ưu Hóa và Bảo mật CI/CD (GitHub Actions Nâng Cao)

Phần 1 đã dựng thành công một luồng CI/CD cơ bản. Tuy nhiên, luồng cơ bản đó mang trong mình những điểm yếu chí mạng: sập server do chạy đè, nguy cơ lộ khóa bảo mật, và tốc độ rùa bò do tải nặng. Phần 2 này sẽ "phẫu thuật" từng điểm yếu một bằng các chiến lược DevOps nâng cao.

## Concurrency control

Khi nhiều lập trình viên cùng đẩy mã nguồn lên nhánh chính cùng một thời điểm, các tiến trình triển khai sẽ được kích hoạt và chạy song song (parallel). Điều này dẫn đến tình trạng hai tiến trình cùng cố gắng ghi đè lên máy chủ, gây xung đột cổng, khóa database (lock), và sụp đổ hệ thống. Khái niệm `concurrency` (Kiểm soát đồng thời) sinh ra để giải quyết bài toán này.

Hệ thống cung cấp cho chúng bản thân hai cơ chế để kiểm soát: **Queue (Xếp hàng)** và **Cancel (Hủy diệt)**. Bằng cách gom các tiến trình lại thông qua thuộc tính `group`, chúng ta ép chúng không được phép chạy song song nữa.

**1. Cơ chế Queue (Hàng đợi 1-chỗ-trống)**
Nếu chỉ định nghĩa `group` mà không cấu hình gì thêm, GitHub Actions sẽ mặc định áp dụng luật xếp hàng. Tuy nhiên, hàng đợi (Queue) của nó vô cùng khắt khe: **Chỉ có đúng 1 chỗ trống duy nhất ở trạng thái Pending**.
- Nếu Tiến trình 1 đang chạy, Tiến trình 2 đi sau sẽ ngoan ngoãn chui vào Queue nằm chờ.
- Nhưng nếu Tiến trình 3 đột ngột xuất hiện, nó sẽ thẳng tay "đá văng" Tiến trình 2 ra khỏi Queue để cướp chỗ. Tiến trình 2 bị hủy (Cancelled) hoàn toàn. Khi Tiến trình 1 chạy xong, Tiến trình 3 mới nhất sẽ được nối bước.

Cơ chế này sinh ra để tối ưu hóa thời gian: Khi Deploy, chúng ta luôn chỉ cần đưa bản code mới nhất (Tiến trình 3) lên server, hoàn toàn không có lý do gì phải tốn tài nguyên chạy deploy một bản code đã cũ (Tiến trình 2) cả.

**2. Cờ Cancel-in-progress (Hủy tức thì)**
Nếu không muốn Tiến trình 3 phải chờ đợi Tiến trình 1 chạy xong, có thể kẹp thêm cờ `cancel-in-progress: true`. Cờ này có tính sát thương cao: Ngay khi Tiến trình 3 xuất hiện, nó lập tức "giết" Tiến trình 1 giữa chừng để giành trọn tài nguyên chạy ngay lập tức.

*Cảnh báo chí mạng:* Tuyệt đối cẩn trọng khi dùng `cancel-in-progress: true` ở chính giai đoạn **Deploy**. Nếu Tiến trình 1 đang copy dở dang tệp tin lên server mà bị "giết" giữa chừng, máy chủ sẽ rơi vào trạng thái lơ lửng, hỏng hóc (corrupted) do nhận được mã nguồn chắp vá. Với những luồng Deploy copy trực tiếp lên EC2, an toàn nhất là chỉ nên dùng cơ chế Queue (đợi nhau) thay vì Cancel (giết nhau).

**(Thực hành) Mẹo nhỏ cấu hình Group:**
Rất nhiều tài liệu trên mạng dạy cách viết `group: ${{ github.workflow }}-${{ github.ref }}`. Cách này có vẻ đúng, nhưng thực chất nó chỉ ngăn đụng độ trong **cùng một nhánh**. Nếu nhánh `main` và nhánh `dev` cùng deploy lên chung một server EC2, chúng sẽ sinh ra hai nhóm riêng biệt và vẫn chạy song song đè lên nhau.

![Cấu hình "có vẻ đúng" nhưng vẫn chứa lỗ hổng đụng độ chéo nhánh](./image_step/1_0_yml_before_fix.png)
![Hai luồng từ main và dev vẫn chạy song song gây nguy cơ sập EC2](./image_step/1_1_two_runs_parallel.png)

Để khắc phục triệt để, chỉ cần xóa bỏ biến `${{ github.ref }}`. Khi đó, mọi luồng dù xuất phát từ bất kỳ nhánh nào cũng sẽ phải xếp hàng chung vào một nhóm duy nhất:

![Cấu hình chuẩn: group chỉ chứa tên workflow](./image_step/1_2_yml_after_fix.png)
![Chỉ luồng mới nhất được chạy, luồng cũ lập tức bị đánh dấu Cancelled](./image_step/1_3_concurrency_cancel.png)

## Quy tắc nhánh đọc YAML

Ở các hệ thống cơ bản, pipeline thường chỉ lắng nghe sự kiện `push` hoặc `pull_request`. Nhưng thực tế, hệ sinh thái kích hoạt (trigger) của GitHub Actions đồ sộ hơn rất nhiều:
- **`schedule`:** Hẹn giờ chạy luồng theo cú pháp cron (ví dụ: quét bảo mật lúc 2h sáng).
- **`check_run` / `check_suite`:** Lắng nghe phản hồi từ các hệ thống đánh giá chất lượng mã nguồn (như SonarQube).
- **`branch_protection_rule`:** Chạy khi có người thay đổi luật bảo vệ nhánh.
- **`delete` / `discussion`:** Chạy tiến trình dọn dẹp khi có nhánh bị xóa, hoặc phát thông báo khi có bình luận mới.

*Quy tắc ngầm:* Sự kiện đẩy code (`push`) sẽ luôn đọc file YAML ở ngay nhánh vừa đẩy lên. Nhưng đối với các sự kiện "ngoại cảnh" (không gắn liền với một đoạn code cụ thể như `schedule`, `discussion`...), GitHub chỉ quét tìm file YAML ở **nhánh mặc định (`main`)**. 

**(Thực hành) Vấn đề với Cron job:**
Nhiều người lập trình tạo nhánh `test-cron`, viết lịch hẹn giờ nhưng đợi mãi không thấy hệ thống nhúc nhích.
![Lịch hẹn giờ không hoạt động trên nhánh phụ](./image_step/2_2_cron_not_running.png)
Lý do là GitHub không lùng sục hàng trăm nhánh phụ để tìm lịch hẹn. Muốn lịch có hiệu lực thực tế, file YAML bắt buộc phải được merge vào nhánh `main`.
![Sau khi merge vào main, luồng tự động kích hoạt đều đặn](./image_step/2_3_cron_running_after_merge.png)

## Họ workflow_*

Đây là bộ ba sự kiện (`dispatch` / `call` / `run`) chuyên dùng để liên kết các luồng làm việc lại với nhau, biến những file YAML rời rạc thành một hệ thống dây chuyền phức tạp. Giống như quy tắc ở trên, file chứa họ sự kiện này luôn bắt buộc phải được ký gửi ở nhánh `main`.

- **`workflow_dispatch`:** Sinh ra một nút bấm (Manual trigger) ngay trên giao diện web. Hỗ trợ truyền thêm các tham số (inputs) khi chạy thủ công. Cực kỳ hữu dụng cho các luồng rủi ro cao cần sự kiểm soát của con người như dọn dẹp server hoặc rollback.
  *(Lưu ý: Nút bấm chỉ xuất hiện khi file YAML đã nằm ở nhánh `main`. Nhưng khi nhấn nút, hệ thống cho phép tự do chọn chạy trên bất kỳ nhánh nào).*
  ![Nút bấm Run workflow và tùy chọn nhánh](./image_step/3_2_dispatch_button_appeared.png)

- **`workflow_call`:** Khai báo một file YAML là thư viện tái sử dụng (Reusable workflow). Điều này chấm dứt thảm họa copy-paste cùng một kịch bản Deploy cho 50 dự án khác nhau. Chỉ cần sửa code ở 1 nơi trung tâm, mọi kho lưu trữ gọi đến nó đều tự động được cập nhật.
  ![Mô hình file trung tâm được gọi lại bởi nhiều repo khác nhau](./image_step/3_4_workflow_call_diagram.png)

- **`workflow_run`:** Kích hoạt luồng B tự động ngay sau khi luồng A hoàn tất. Áp dụng chuẩn nguyên lý Fail-Fast: Luồng Deploy chứa mã nguồn nhạy cảm chỉ được phép chạy tiếp nếu luồng Test phía trước đã trả về trạng thái Success.
  ![Dùng điều kiện success để khóa chốt an toàn](./image_step/3_5_workflow_run_code.png)
  ![Nối chuỗi hoàn hảo: Test chạy xong mới tới Deploy](./image_step/3_6_workflow_run_chain.png)

## Cache dependencies

**Bản chất (Lý thuyết):**
Trong các dự án NodeJS hay ReactJS, mỗi lần chạy CI/CD là một lần máy chủ phải còng lưng chạy `npm install` để tải lại hàng chục, hàng trăm MB thư viện, gây lãng phí thời gian vô cùng lớn. Cơ chế Cache giải quyết bài toán này bằng cách nén toàn bộ thư viện tải được ở lần đầu tiên và gửi lên kho lưu trữ của GitHub. Ở các lần chạy sau, nếu danh sách thư viện không có gì thay đổi, hệ thống sẽ kéo thẳng kho cache về dùng, tiết kiệm hàng phút đồng hồ so với việc tải lại từ mạng.

**Cách triển khai (Step-by-step):**
- **Bước 1: Băm (Hash) file khóa thư viện**
  Mỗi khi bạn cài thư viện mới, file `package-lock.json` sẽ thay đổi. Hệ thống sẽ đọc file này và băm nó ra thành một chuỗi mã định danh duy nhất thông qua hàm `hashFiles('**/package-lock.json')`.
- **Bước 2: Cấu hình lưu trữ Cache**
  Sử dụng action `actions/cache` ngay trước bước `npm install`. Chỉ định thư mục muốn lưu (`node_modules`) và chìa khóa (key) chính là mã băm vừa tạo.
  ```yaml
      - name: Cache node modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
  ```
- **Bước 3: Tận hưởng tốc độ siêu tốc**
  Nếu mã hash không đổi (chưa cài thêm thư viện), hệ thống sẽ tìm thấy chìa khóa trùng khớp. Thời gian cài đặt `npm install` sẽ giảm từ hàng phút xuống chỉ còn vài giây!

  *(Ảnh minh họa: Lần chạy đầu tiên - Không tìm thấy Cache, phải tải lại từ đầu)*
  ![Lần chạy đầu tiên - Cache miss](./image_step/cache_miss.png)

  *(Ảnh minh họa: Lần chạy thứ hai - Tải siêu tốc từ kho Cache)*
  ![Lần chạy thứ hai - Cache hit](./image_step/cache_hit.png)

## Matrix strategy

**Bản chất (Lý thuyết):**
Khi xây dựng các ứng dụng phức tạp, việc đảm bảo mã nguồn chạy ổn định trên đa dạng các môi trường là bắt buộc. Thay vì phải nhân bản (copy) file YAML ra thành hàng tá phiên bản đứt gãy để test từng cái một, chiến lược Ma trận (Matrix) cho phép định nghĩa một mảng các biến số đa chiều. Từ đó, GitHub Actions sẽ tự động nhân bản ra hàng loạt luồng chạy song song để phủ kín mọi tổ hợp môi trường.

**Cách triển khai (Step-by-step):**
- **Bước 1: Khai báo các chiều không gian của ma trận**
  Dưới mục `strategy` của một Job, định nghĩa các mảng biến số. Ví dụ test trên 3 hệ điều hành và 3 phiên bản Node:
  ```yaml
  jobs:
    test_code:
      strategy:
        matrix:
          os: [ubuntu-latest, windows-latest, macos-latest]
          node-version: [16, 18, 20]
      runs-on: ${{ matrix.os }} # Động hóa hệ điều hành
  ```
- **Bước 2: Sử dụng biến ma trận trong luồng chạy**
  ```yaml
      steps:
        - uses: actions/checkout@v4
        - name: Cài đặt NodeJS
          uses: actions/setup-node@v4
          with:
            node-version: ${{ matrix.node-version }} # Động hóa phiên bản Node
  ```
- **Bước 3: Hưởng thụ sức mạnh tự động nhân bản**
  Hệ thống sẽ tự động tạo ra $3 \times 3 = 9$ luồng chạy độc lập (VD: Ubuntu chạy Node 16...). Sai ở đâu báo đỏ chính xác ở đó.

  *(Ảnh minh họa: Giao diện GitHub Actions tự động sinh ra 9 luồng chạy song song từ 1 cấu hình duy nhất)*
  ![Sức mạnh nhân bản của Matrix](./image_step/matrix_runs.png)

## Docker Hub

Hạn chế lớn nhất ở Part 1 là việc dùng SCP copy từng file mã nguồn qua mạng chật hẹp, bắt máy chủ EC2 yếu ớt phải vừa đóng vai web server vừa kiêm luôn vai build server. Điều này vắt kiệt bộ nhớ và rất dễ gây treo máy diện rộng.

Kiến trúc chuẩn DevOps yêu cầu máy chủ EC2 phải hoàn toàn rảnh rỗi. Mọi tác vụ nặng nề phải được nhường lại cho GitHub Actions xử lý. Hệ thống GitHub Actions sẽ đảm nhận việc đóng gói mã nguồn thành một khối thống nhất (Docker Image), đẩy khối đó lên trung tâm lưu trữ (Docker Hub). Sau đó, EC2 chỉ việc "nhẹ nhàng" tải nguyên cục Image về và khởi chạy.

**(Thực hành) Tối ưu hóa tốc độ với cấu trúc 2 Job:**
1. Cấu hình 2 biến môi trường `DOCKER_USERNAME` và `DOCKER_PASSWORD` vào kho Secrets của GitHub để trao quyền tải lên.
   ![Khai báo thông tin tài khoản Docker Hub vào Secrets](./image_step/4_2_github_secrets.png)
2. Tách luồng cũ thành hai tiến trình rõ rệt. **Job 1 (Build & Push)**: Đóng gói và gửi Image lên kho. **Job 2 (Deploy Fast)**: Máy ảo EC2 kéo trực tiếp Image đã "nấu chín" từ Docker Hub về dùng.
   Thay vì copy hàng trăm tệp, lệnh SCP ở Job 2 giờ đây chỉ cần truyền qua đúng một tệp tin nhẹ vài byte là `docker-compose.yml`. Mọi thứ diễn ra siêu tốc trong chớp mắt.
   ![Luồng chạy siêu tốc với 2 Job độc lập](./image_step/4_4_deploy_fast.png)

## permissions: block

**Bản chất (Lý thuyết):**
Mặc định, GitHub Actions được cấp một thẻ thông hành (`GITHUB_TOKEN`) có đặc quyền đọc/ghi khá rộng rãi. Nếu vô tình chạy một thư viện xấu từ bên thứ ba chứa mã độc, kho mã nguồn hoàn toàn có thể bị xóa hoặc phá hoại. Nguyên tắc "đặc quyền tối thiểu" (Least-Privilege) buộc chúng ta phải tước bỏ mọi quyền mặc định, luồng nào cần việc gì thì mới cấp đúng quyền đó.

**Cách triển khai (Step-by-step):**
- **Bước 1: Tước bỏ mọi đặc quyền mặc định**
  Ở ngay đầu file `.yml`, thêm khối `permissions` và thiết lập mọi thứ về "chỉ đọc" hoặc cấm hoàn toàn.
  ```yaml
  permissions: read-all # Hoặc khắt khe hơn: permissions: {}
  ```
- **Bước 2: Chỉ cấp quyền cần thiết ở cấp độ Job**
  Ví dụ, Job cần xin token OIDC của AWS thì chỉ Job đó mới được cấp quyền ghi token:
  ```yaml
  jobs:
    deploy:
      permissions:
        id-token: write # Chỉ cấp quyền sinh token ngắn hạn
        contents: read  # Quyền đọc mã nguồn
  ```

## OIDC cho AWS

**Bản chất (Lý thuyết):**
Việc lưu trữ khóa tĩnh (`AWS_ACCESS_KEY` hay `EC2_SSH_KEY`) vào GitHub Secrets gọi là sử dụng "khóa dài hạn" (Long-term credentials). Dù được mã hóa, nếu bị lộ, hệ thống sẽ bị chiếm quyền vĩnh viễn. Bảo mật hiện đại chuyển sang dùng OpenID Connect (OIDC). Cụ thể, hệ thống AWS và GitHub sẽ "bắt tay" xác thực với nhau mà không cần chìa khóa tĩnh. AWS sẽ cấp cho luồng chạy một "Token ngắn hạn" có tuổi thọ vài phút. Chạy xong là token tự hủy, không còn rủi ro lộ khóa.

**Cách triển khai (Step-by-step):**
- **Bước 1: Đăng ký GitHub làm "Khách quen" trên AWS**
  Vào AWS IAM, tạo một Identity Provider trỏ URL về kho quản lý token của GitHub (`token.actions.githubusercontent.com`).
- **Bước 2: Tạo IAM Role với Trust Relationship**
  Tạo Role trên AWS chứa các quyền cần thiết. Cấu hình Trust relationships để AWS chỉ chấp nhận token phát ra từ đúng tên Repository và nhánh `main` của bạn.
- **Bước 3: Xin quyền sinh Token trong GitHub Actions**
  Cấp quyền `id-token: write` trong khối `permissions` của file YAML.
- **Bước 4: Gọi Action cấu hình tự động**
  Dùng action của AWS và truyền vào định danh (ARN) của Role vừa tạo.
  ```yaml
  - name: Configure AWS credentials
    uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::111122223333:role/MyGitHubDeployRole
      aws-region: ap-southeast-1
  ```

## environment: + required reviewers

**Bản chất (Lý thuyết):**
Tự động hóa 100% luồng Deploy là đích đến lý tưởng, nhưng đưa thẳng một mạch mã nguồn lên máy chủ Production mà không qua kiểm duyệt bằng mắt là hành động mang rủi ro cực cao. Khái niệm `environment` tạo ra các ranh giới môi trường ảo. Đi kèm với nó là tính năng Cổng phê duyệt (Required reviewers), bắt buộc hệ thống phải "đóng băng" để chờ cái gật đầu của con người trước khi lên sóng.

**Cách triển khai (Step-by-step):**
- **Bước 1: Khởi tạo ranh giới môi trường ảo**
  Truy cập **Settings > Environments** trên kho lưu trữ GitHub, tạo môi trường tên `production`.
- **Bước 2: Thiết lập Cổng phê duyệt (Required reviewers)**
  Đánh dấu tích vào "Required reviewers" và gán tên tài khoản của Lead/Manager vào danh sách.
- **Bước 3: Gắn thẻ môi trường vào Job Deploy**
  Bổ sung từ khóa `environment` vào Job cuối cùng.
  ```yaml
  jobs:
    deploy_to_ec2:
      runs-on: ubuntu-latest
      environment: production # Gắn thẻ môi trường
      steps:
        # Các bước deploy...
  ```
  **Kết quả:** Dù mã nguồn đã vượt qua bài Test, luồng chạy vẫn bị dừng lại ở trạng thái chờ (vàng). Chỉ khi Lead vào xem và bấm nút duyệt (Approve) bằng tay, mã nguồn mới được Deploy lên server.
