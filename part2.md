# CI/CD Phần 2: Những điểm dễ sai khi dùng GitHub Actions

Phần 1 đã dựng được luồng CI/CD cơ bản. Phần này đi vào ba chỗ thường gây lỗi thầm lặng: cơ chế chống đụng độ, quy tắc GitHub chọn nhánh để đọc file YAML, và họ sự kiện `workflow_*`.

---

## 1. Concurrency Control

Mặc định, mỗi lần push kích hoạt một luồng Actions chạy độc lập. Nếu hai developer push cách nhau 10 giây, Actions tạo hai máy ảo song song, cùng SSH vào EC2 và chạy `docker compose up`. Kết quả là xung đột cổng, database bị lock, hoặc sập web.

Thêm `concurrency` vào file `deploy.yml` để Actions hủy luồng cũ khi có luồng mới hơn cùng nhóm:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Tuy nhiên, cấu hình trên chỉ bảo vệ trong phạm vi **cùng nhánh**. `${{ github.ref }}` là tên nhánh, nên push từ `main` và push từ `dev` vào cùng lúc tạo ra hai concurrency group khác nhau — vẫn chạy song song, vẫn đụng nhau trên cùng một server EC2.

Nếu nhiều nhánh cùng deploy lên một server, bỏ `${{ github.ref }}` ra:

```yaml
concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: true
```

Khi đó mọi luồng của cùng một workflow đều vào chung một nhóm, bất kể nhánh nào.

> **Demo:** Push từ máy local, rồi ngay lập tức sửa một file nhỏ và commit trực tiếp trên giao diện GitHub Web. GitHub nhận hai commit gần như đồng thời và kích hoạt hai luồng song song.

![Chụp màn hình tab Actions đang hiển thị 2 luồng chạy song song cùng lúc](./image_part2/1_1_two_runs_parallel.png)

Sau khi thêm `concurrency` và push lại, luồng cũ bị hủy ngay, chỉ luồng mới nhất tiếp tục chạy.

![Chụp màn hình tab Actions hiển thị luồng cũ bị hủy (Cancelled) và chỉ còn 1 luồng mới đang chạy](./image_part2/1_2_concurrency_cancel.png)

---

## 2. GitHub chọn nhánh nào để đọc file YAML?

Quan niệm phổ biến: file YAML ở nhánh nào thì GitHub đọc nhánh đó. Đúng, nhưng chỉ với một nhóm sự kiện nhất định.

GitHub Actions chạy theo sự kiện. Khi sự kiện xảy ra, GitHub cần xác định: *sự kiện này thuộc về nhánh nào, để biết đọc file YAML ở đâu?*

**Sự kiện từ code** (`push`, `pull_request`): GitHub biết rõ ngữ cảnh — push vào nhánh `dev` thì đọc file YAML ở `dev`. Đúng như kỳ vọng.

![Chụp màn hình tab Actions hiển thị tên nhánh "dev" là nhánh đã kích hoạt luồng CI/CD](./image_part2/2_1_push_on_dev_branch.png)

**Sự kiện từ ngoại cảnh** (`schedule`, `issue_comment`, v.v.): Thời gian hay một bình luận vào Issue không gắn với nhánh nào. GitHub không thể mò từng nhánh để tìm cấu hình liên quan — với repo có hàng trăm nhánh, đó là bài toán không giải được. Cách GitHub xử lý: chỉ đọc file YAML ở **nhánh mặc định** (`main`). File ở nhánh khác không được đọc, không phát sinh lỗi, chỉ đơn giản là bị bỏ qua.

Ví dụ thường gặp: tạo nhánh `test-cron`, viết file hẹn giờ chạy lúc 12h đêm, push lên. Đến 12h đêm không có gì xảy ra. Để lịch có hiệu lực, file đó phải được merge vào `main`.

> **Quy tắc:** sự kiện từ code đọc YAML ở nhánh của code đó; sự kiện từ ngoại cảnh đọc YAML ở `main`.

---

## 3. Họ `workflow_*`

Ba sự kiện `workflow_dispatch`, `workflow_call`, `workflow_run` đều thuộc loại ngoại cảnh. Áp dụng quy tắc ở Phần 2: file YAML chứa chúng phải nằm trên nhánh `main` thì GitHub mới nhận diện và kích hoạt được.

### `workflow_dispatch`

Sự kiện này sinh ra nút bấm "Run workflow" trên giao diện web GitHub, cho phép kích hoạt CI/CD thủ công bất cứ lúc nào mà không cần push code.

Bẫy hay gặp: viết `on: workflow_dispatch` ở nhánh `dev`, push lên, vào tab Actions tìm nút bấm — không thấy. Lý do là giao diện web chỉ quét `main` để vẽ nút, đúng với quy tắc ngoại cảnh ở trên. Nút chỉ xuất hiện sau khi file được merge vào `main`.

**Trước khi merge vào `main`:** không có nút nào.

![Chụp màn hình tab Actions khi file workflow_dispatch chỉ ở nhánh dev — không có nút "Run workflow" nào hiển thị](./image_part2/3_1_dispatch_button_missing.png)

**Sau khi merge:** nút xuất hiện.

![Chụp màn hình tab Actions sau khi merge vào main — nút "Run workflow" đã xuất hiện ở góc phải](./image_part2/3_2_dispatch_button_appeared.png)

Điểm đáng chú ý: khi bấm nút, GitHub hỏi muốn lấy code từ nhánh nào. File định nghĩa nút phải ở `main`, nhưng nút đó có thể chạy trên code của bất kỳ nhánh nào.

![Chụp màn hình menu dropdown khi bấm "Run workflow", hiển thị ô chọn nhánh (Use workflow from)](./image_part2/3_3_dispatch_branch_selector.png)

### `workflow_call`

Sự kiện này biến một file YAML thành thư viện tái sử dụng — file YAML khác ở bất kỳ repo nào trong tổ chức đều có thể gọi vào.

Bài toán thực tế: 50 repo có quy trình deploy giống nhau. Copy paste file `deploy.yml` sang 50 chỗ thì mỗi lần sửa phải cập nhật 50 nơi. Với `workflow_call`, chỉ cần một file trung tâm; 50 repo còn lại gọi vào bằng một dòng trỏ link. Sửa một chỗ, 50 repo áp dụng theo.

![Sơ đồ minh họa: 1 file workflow_call ở repo trung tâm được nhiều repo khác nhau gọi lại](./image_part2/3_4_workflow_call_diagram.png)

### `workflow_run`

Sự kiện này kích hoạt một workflow khi một workflow khác vừa chạy xong.

Dùng để tách biệt trách nhiệm: `test.yml` lo kiểm thử, `deploy.yml` lo triển khai, `workflow_run` nối hai bên lại. Deploy chỉ chạy khi test xanh. Hai file có thể ở hai repo khác nhau mà vẫn kết nối được qua sự kiện này.

![Chụp màn hình tab Actions hiển thị workflow Deploy được kích hoạt tự động ngay sau khi workflow Test hoàn thành thành công](./image_part2/3_5_workflow_run_chain.png)

---

Tóm lại: `push` và `pull_request` phù hợp với dự án đơn lẻ. Họ `workflow_*` dùng khi cần điều phối CI/CD qua nhiều repo hoặc cần kiểm soát thủ công ở từng bước.
