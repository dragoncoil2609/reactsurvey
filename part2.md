# Hướng dẫn Toàn tập CI/CD (Phần 2): Đào sâu vào các "Góc khuất" của GitHub Actions

Ở Phần 1, chúng ta đã xây dựng thành công một luồng CI/CD cơ bản để triển khai ứng dụng lên AWS EC2. Tuy nhiên, để hệ thống thực sự "sẵn sàng chiến đấu" trong môi trường Doanh nghiệp (Enterprise), chúng ta cần giải quyết những bài toán hóc búa mà các tài liệu cơ bản thường bỏ qua.

Trong Phần 2 này, chúng ta sẽ đi theo một hành trình từ **cơ chế bảo vệ cốt lõi** → **bản chất của việc GitHub chọn nhánh để đọc file YAML** → **áp dụng bản chất đó vào bộ 3 sự kiện quyền lực nhất: họ `workflow_*`**.

---

## 1. Cơ chế chống đụng độ (Concurrency Control)

Điều gì xảy ra nếu 2 lập trình viên gõ lệnh `git push` cách nhau đúng 10 giây? GitHub Actions sẽ tạo ra 2 máy ảo chạy **song song**, cùng lúc kết nối SSH vào EC2 và gõ lệnh `docker compose up`. Hậu quả là xung đột cổng (port clash), database bị lock, và tệ nhất là sập toàn bộ hệ thống Web.

Cấu hình `concurrency` sinh ra để giải quyết đúng bài toán này: tự động hủy luồng đang chạy dở và chỉ ưu tiên thực thi luồng mới nhất.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Tuy nhiên, đây là điểm mà hầu hết các tutorial trên mạng **bỏ sót**: cấu hình phổ biến trên chỉ chống đụng độ trong **cùng một nhánh** (vì `${{ github.ref }}` chính là tên nhánh). Nếu team làm việc trên nhiều nhánh khác nhau nhưng cùng deploy lên **1 server EC2**, hai luồng từ nhánh `main` và nhánh `dev` vẫn sẽ tạo ra 2 concurrency group riêng biệt và chạy song song — tức là vẫn đụng nhau!

Để bảo vệ toàn diện cho trường hợp **khác nhánh**, hãy bỏ `${{ github.ref }}` ra khỏi tên nhóm:

```yaml
# Chống đụng độ TOÀN BỘ - kể cả khi push từ các nhánh khác nhau
concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: true
```

> **Demo:** Push code từ máy local, sau đó ngay lập tức vào giao diện GitHub Web chỉnh sửa trực tiếp một file bất kỳ và bấm "Commit changes". GitHub sẽ nhận 2 commit liên tiếp và kích hoạt 2 luồng song song.

![Chụp màn hình tab Actions đang hiển thị 2 luồng chạy song song cùng lúc](./image_part2/1_1_two_runs_parallel.png)

Sau khi thêm cấu hình `concurrency` và push lại, kết quả trên tab Actions sẽ thay đổi hoàn toàn — luồng cũ bị hủy ngay lập tức, chỉ còn luồng mới nhất được phép tiếp tục chạy.

![Chụp màn hình tab Actions hiển thị luồng cũ bị hủy (Cancelled) và chỉ còn 1 luồng mới đang chạy](./image_part2/1_2_concurrency_cancel.png)

---

## 2. Giải mã cái bẫy: "File YAML ở nhánh nào thì chạy nhánh đó"

Nhiều người mới học CI/CD thường mặc định rằng: Cứ viết lệnh ở nhánh nào thì GitHub sẽ lấy file YAML ở nhánh đó ra chạy. Tuy nhiên, **thực tế phức tạp hơn rất nhiều**.

GitHub Actions là một hệ thống chạy bằng **Sự kiện (Events)**. Câu hỏi cốt lõi mà GitHub phải trả lời khi có sự kiện xảy ra là: *"Sự kiện này sinh ra từ đâu? Từ một nhánh code cụ thể, hay từ ngoại cảnh?"* Tùy vào câu trả lời, GitHub sẽ quyết định đọc file YAML ở nhánh nào.

### Nhóm 1: Sự kiện sinh ra từ Code (`push`, `pull_request`)

Bạn đang code trên nhánh `dev`, sửa file `deploy.yml`, và gõ lệnh `git push`. GitHub biết chắc chắn ngữ cảnh của hành động Push này là nhánh `dev`, nên sẽ lập tức lấy file `deploy.yml` ở nhánh `dev` ra đọc và chạy.

**Kết luận:** ✅ Branch nào thì chạy YAML của Branch đó. Đúng lý thuyết!

![Chụp màn hình tab Actions hiển thị tên nhánh "dev" là nhánh đã kích hoạt luồng CI/CD](./image_part2/2_1_push_on_dev_branch.png)

### Nhóm 2: Sự kiện đến từ Ngoại cảnh (`schedule`, `issue_comment`, `workflow_*`, v.v.)

Bạn tạo nhánh `test-cron`, viết một file YAML hẹn giờ: *"Đúng 12h đêm thì chạy lệnh quét virus"*. Push lên và ngồi đợi. Đến 12h đêm... không có gì xảy ra cả!

Lý do: thời gian (12h đêm) hay một bình luận vào Issue là những sự kiện **khách quan**, không thuộc về bất kỳ nhánh code nào. Nếu GitHub phải đi mò vào từng nhánh trong số hàng trăm nhánh đang mở để tìm xem có cài đặt hẹn giờ không, hệ thống sẽ loạn. Để giải quyết vấn đề này, GitHub ra một quy tắc bất di bất dịch: **Đối với sự kiện đến từ ngoại cảnh, GitHub CHỈ đọc file YAML nằm ở nhánh mặc định (`main`). Mọi nhánh khác đều bị coi là vô hình.**

Cách khắc phục duy nhất là gộp (merge) code vào `main`, thì kịch bản mới bắt đầu có hiệu lực.

> **Quy tắc vàng để nhớ:**
> - Sự kiện **từ Code** → GitHub đọc YAML ở **nhánh chứa code đó**.
> - Sự kiện **từ Ngoại cảnh** → GitHub **bắt buộc** đọc YAML ở **nhánh `main`**.

---

## 3. Hệ sinh thái `workflow_*`: Vũ khí xây dựng CI/CD quy mô lớn

Sau khi đã nắm vững "Quy tắc vàng" ở Phần 2, hãy áp dụng nó để hiểu bộ 3 sự kiện quyền lực nhất của GitHub Actions: họ `workflow_*`.

Cả 3 thành viên đều thuộc **nhóm Ngoại cảnh**, vì vậy chúng đều chịu chung một số phận: **file YAML chứa chúng bắt buộc phải được merge vào nhánh `main` thì GitHub mới nhận diện và kích hoạt được.**

### 3.1. `workflow_dispatch` (Nút bấm thủ công)

Bạn muốn làm một cái nút trên giao diện web GitHub để sếp có thể bấm vào là Deploy. Bạn viết `on: workflow_dispatch` ở nhánh `dev`, push lên, rồi vào giao diện web tìm cái nút... nhưng tìm mỏi mắt cũng không thấy đâu!

Áp dụng "Quy tắc vàng": `workflow_dispatch` là sự kiện Ngoại cảnh (do con người bấm nút trên Web). Giao diện web chỉ quét nhánh `main` để "vẽ" ra nút bấm. Khi file YAML chưa được merge vào `main`, GitHub sẽ từ chối hiện nút đó trên web.

**Bước 1 — Trạng thái lỗi:** File `workflow_dispatch` đang ở nhánh `dev`, chưa được merge vào `main`. Không hề có nút bấm nào xuất hiện.

![Chụp màn hình tab Actions khi file workflow_dispatch chỉ ở nhánh dev — không có nút "Run workflow" nào hiển thị](./image_part2/3_1_dispatch_button_missing.png)

**Bước 2 — Sau khi merge vào `main`:** Nút bấm xuất hiện.

![Chụp màn hình tab Actions sau khi merge vào main — nút "Run workflow" đã xuất hiện ở góc phải](./image_part2/3_2_dispatch_button_appeared.png)

**Bước 3 — Điểm bá đạo:** Khi bấm nút, GitHub hiện ra menu cho phép bạn chỉ định chạy trên code của nhánh nào — `main`, `dev`, hay bất kỳ nhánh nào. File định nghĩa nút bấm bắt buộc phải ở `main`, nhưng khi bấm thì bạn **được quyền ép nó chạy trên code của bất kỳ nhánh nào**. Đây là điểm cực kỳ hữu ích mà nhiều người không biết cho đến khi đọc kỹ docs.

![Chụp màn hình menu dropdown khi bấm "Run workflow", hiển thị ô chọn nhánh (Use workflow from)](./image_part2/3_3_dispatch_branch_selector.png)

---

### 3.2. `workflow_call` (Tái sử dụng - Reusable Workflow)

Công ty bạn có 50 dự án với quy trình Deploy giống nhau. Copy/paste file `deploy.yml` sang 50 repo là một thảm họa bảo trì — mỗi khi cần sửa một dòng lệnh, bạn phải mở từng repo ra sửa thủ công 50 lần.

`workflow_call` giải quyết bài toán này theo cách triệt để: biến một file YAML thành một "Thư viện" có thể tái sử dụng. Bạn chỉ cần tạo **1 file YAML duy nhất** ở một repo trung tâm với `on: workflow_call`. Sau đó, 50 repo kia chỉ cần một dòng trỏ link về đó là xong. Khi cần cập nhật quy trình, sửa đúng 1 chỗ, 50 repo tự động áp dụng theo — đây là chuẩn **DRY (Don't Repeat Yourself)** được nâng lên tầm hệ thống.

![Sơ đồ minh họa: 1 file workflow_call ở repo trung tâm được nhiều repo khác nhau gọi lại](./image_part2/3_4_workflow_call_diagram.png)

---

### 3.3. `workflow_run` (Dây chuyền nối tiếp)

`workflow_run` giải quyết một bài toán kiến trúc quan trọng: **Tách biệt hoàn toàn trách nhiệm (Separation of Concerns)**. Thay vì nhồi nhét cả Test lẫn Deploy vào một file YAML ngày càng phình to và khó bảo trì, bạn tách thành 2 file độc lập — `test.yml` lo việc kiểm thử, `deploy.yml` lo việc triển khai — và để `workflow_run` làm cầu nối tự động. Chỉ khi `test.yml` báo xanh (thành công 100%), `deploy.yml` mới được phép kích hoạt. Thậm chí, 2 file này có thể nằm ở 2 kho code hoàn toàn khác nhau mà vẫn "giao tiếp" được với nhau một cách trơn tru.

![Chụp màn hình tab Actions hiển thị workflow Deploy được kích hoạt tự động ngay sau khi workflow Test hoàn thành thành công](./image_part2/3_5_workflow_run_chain.png)

---

**Tóm lại:** Nếu `push` hay `pull_request` là những sự kiện cơ bản ở tầm dự án đơn lẻ, thì hệ sinh thái **`workflow_*`** sinh ra là để quy hoạch và quản trị CI/CD ở quy mô **Công ty/Enterprise khổng lồ**.
