# Hướng dẫn Toàn tập CI/CD (Phần 2): Đào sâu vào các "Góc khuất" của GitHub Actions

Ở Phần 1, chúng ta đã xây dựng thành công một luồng CI/CD cơ bản để triển khai ứng dụng lên AWS EC2. Tuy nhiên, để hệ thống thực sự "sẵn sàng chiến đấu" trong môi trường Doanh nghiệp (Enterprise), chúng ta cần giải quyết những bài toán hóc búa mà các tài liệu cơ bản thường bỏ qua.

Trong Phần 2 này, chúng ta sẽ đi sâu vào các cơ chế nâng cao và "giải mã" cách GitHub Actions thực sự suy nghĩ.

---

## 1. Cơ chế chống đụng độ (Concurrency Control)

**Vấn đề:** Điều gì xảy ra nếu 2 lập trình viên gõ lệnh `git push` cách nhau đúng 10 giây? 
GitHub Actions sẽ tạo ra 2 máy ảo chạy song song, cùng lúc kết nối SSH vào EC2 và gõ lệnh `docker compose up`. 
**Hậu quả:** Xung đột cổng (port clash), database bị lock, và tệ nhất là sập toàn bộ hệ thống Web.

**Giải pháp:** Cấu hình `concurrency` để tự động hủy luồng cũ và chỉ ưu tiên chạy luồng mới nhất.

**Code bổ sung (vào file `deploy.yml`):**
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

---

## 2. Giải mã cái bẫy: "File YAML ở nhánh nào thì chạy nhánh đó"

Nhiều người mới học CI/CD thường mặc định rằng: Cứ viết lệnh ở nhánh nào thì nó sẽ lấy code ở nhánh đó ra chạy. Tuy nhiên, thực tế phức tạp hơn rất nhiều. GitHub Actions là một hệ thống chạy bằng **Sự kiện (Events)**, và tùy thuộc vào loại sự kiện mà nó sẽ quyết định đọc file YAML ở đâu.

Dưới đây là 4 nhóm sự kiện "bá đạo" mà bạn bắt buộc phải nằm lòng:

### Nhóm 1: Sự kiện gắn liền với Code (Push, Pull Request)
Đây là cái lý thuyết cơ bản mà ai cũng biết.
- **Tình huống:** Bạn đang code trên nhánh `dev`, sửa file `deploy.yml`, và gõ lệnh `git push`.
- **Cách GitHub hiểu:** Hành động Push này là đẩy code thẳng vào nhánh `dev`. Vì vậy, GitHub biết chắc chắn ngữ cảnh đang ở nhánh `dev`. Nó sẽ lập tức lấy file `deploy.yml` ở nhánh `dev` ra đọc và chạy.
- **Kết luận:** Branch nào chạy YAML của Branch đó. Đúng lý thuyết!

### Nhóm 2: Sự kiện về Thời gian (Schedule / Cronjob)
Đây là lúc lý thuyết bắt đầu bị phá vỡ!
- **Tình huống:** Bạn tạo nhánh `test-cron`, viết một file YAML hẹn giờ: *"Đúng 12h đêm thì chạy lệnh quét virus"*. Bạn gõ `git push` lên nhánh `test-cron` và ngồi đợi. Đến 12h đêm... không có gì xảy ra cả!
- **Cách GitHub hiểu:** Thời gian (12h đêm) là một sự kiện khách quan, không thuộc về bất kỳ nhánh code nào. Giả sử một công ty có 100 nhánh (branch) đang mở, nếu GitHub phải đi mò từng nhánh xem có cài đặt hẹn giờ hay không thì hệ thống sẽ loạn.
- **Cơ chế bắt buộc:** Để không bị loạn, GitHub ra một luật thép: **Đối với sự kiện thời gian, tôi chỉ chấp nhận đọc file YAML nằm ở nhánh mặc định (nhánh `main`). Mọi nhánh khác đều bị coi là tàng hình.**
- **Cách khắc phục:** Bạn bắt buộc phải gộp (merge) nhánh `test-cron` đó vào `main`, thì đúng 12h đêm hôm sau nó mới bắt đầu chạy!

### Nhóm 3: Sự kiện do con người bấm nút (workflow_dispatch)
Đây là góc khuất mà rất nhiều Senior thỉnh thoảng vẫn quên và "chửi" GitHub sao bị lỗi.
- **Tình huống:** Bạn muốn làm một cái nút trên giao diện web GitHub để sếp có thể bấm vào là Deploy. Bạn viết lệnh `on: workflow_dispatch` ở nhánh `dev`. Bạn mở giao diện web lên để tìm cái nút bấm... nhưng tìm mỏi mắt cũng không thấy nút đâu!
- **Cách GitHub hiểu:** Để giao diện web của GitHub có thể "vẽ" ra được cái nút bấm cho bạn, nó phải biết là có tồn tại kịch bản đó. Và một lần nữa, **giao diện web chỉ quét nhánh `main` để tìm kịch bản**. Khi cái file YAML của bạn chưa được gộp vào `main`, GitHub sẽ từ chối hiện cái nút đó trên web.
- **Cơ chế hoạt động:** Đầu tiên, bạn phải merge file YAML đó vào `main`. Lúc này trên giao diện web sẽ hiện ra nút bấm. Nhưng bù lại, khi bấm cái nút đó, GitHub sẽ hiện ra một cái menu thả xuống hỏi bạn: *"Bạn muốn chạy cái file YAML này nhưng lấy code ở nhánh nào (main hay dev)?"*.
- **Kết luận:** File định nghĩa nút bấm bắt buộc phải nằm ở `main`, nhưng khi bấm nút thì bạn được quyền ép nó chạy trên code của nhánh khác.

### Nhóm 4: Sự kiện tương tác trên GitHub (Issue Comment)
- **Tình huống:** Bạn viết một kịch bản: *"Mỗi khi có người bình luận vào một Issue, hãy chạy lệnh ABC"*. Bạn viết kịch bản này trên nhánh `bug-fix-1`.
- **Cách GitHub hiểu:** Một cái Issue (lỗi báo cáo) là thứ của chung toàn bộ dự án, nó không thuộc về riêng nhánh code nào cả. Vậy khi có người comment vào Issue, GitHub phải dùng file YAML ở nhánh nào để đọc lệnh?
- **Cơ chế bắt buộc:** Câu trả lời tiếp tục là: **Nó chỉ lấy file YAML ở nhánh `main` để chạy**. Nếu kịch bản đó ở `bug-fix-1`, nó sẽ ngó lơ.
