---
title: "AWS Có Gì Mới: Tổng Hợp Tháng 6 → Tháng 10/2026"
date: 2026-10-25
description: "Điểm lại tính năng mới của AWS từ tháng 6 đến tháng 10/2026: Local Zone Hà Nội, Lambda Web Functions, vector search trong DynamoDB, rollback phiên bản EKS, CloudWatch Omni và danh sách dịch vụ sắp ngừng hoạt động."
tags: [AWS, Lambda, DynamoDB, EKS, Bedrock, CloudWatch]
draft: true
---

AWS ra mắt tính năng mới liên tục, nên bài này tóm tắt lại những tính năng đáng chú ý để mọi người dễ theo dõi hơn. Bài tổng hợp các ra mắt từ tháng 6 đến giữa tháng 10/2026.


---

## Tin đáng chú ý cho người dùng ở Việt Nam

### AWS Local Zone tại Hà Nội (GA, 19/6/2026)

Đây là Local Zone đầu tiên của AWS ở Việt Nam, tên `ap-southeast-1-han-1a`. Tiền tố cho thấy zone gắn với Region Singapore, dù không có thông báo nhắc đến.

Lúc ra mắt có EC2 C7i/M7i/R7i, S3 One Zone-IA, EBS (gp3, gp2, io1, sc1, st1) kèm **EBS Local Snapshots**, cùng với ECS, EKS, VPC, Direct Connect và ALB.

**Vì sao đáng chú ý:** độ trễ giảm đi nhiều cho người dùng miền bắc. Quan trọng hơn là **lưu dữ liệu trong nước**: cả dữ liệu lẫn bản snapshot đều nằm tại Việt Nam, giúp doanh nghiệp đáp ứng yêu cầu lưu trữ dữ liệu trong nước theo Luật An ninh mạng và Nghị định 53/2022, vốn hay gặp ở ngân hàng, fintech và các cơ quan nhà nước.

**Lưu ý:** Local Zone không phải Region đầy đủ. Danh sách dịch vụ ngắn và chỉ có một zone, nên kiến trúc cần high availability vẫn phải có phương án failover sang Region cha. Zone mặc định chưa bật:

```bash
# Tra group name của zone Hà Nội
aws ec2 describe-availability-zones --region ap-southeast-1 \
  --all-availability-zones \
  --query "AvailabilityZones[?ZoneName=='ap-southeast-1-han-1a'].[ZoneName,GroupName,OptInStatus]"

# Bật zone (thay <group-name> bằng giá trị vừa tra được)
aws ec2 modify-availability-zone-group --region ap-southeast-1 \
  --group-name <group-name> --opt-in-status opted-in
```

Thử thật bằng AWS CLI trên một tài khoản cá nhân, chỉ chạy lệnh tra cứu, chưa bật zone:

```
$ aws ec2 describe-availability-zones --region ap-southeast-1 --all-availability-zones \
    --query "AvailabilityZones[?ZoneName=='ap-southeast-1-han-1a'].[ZoneName,GroupName,ZoneType,OptInStatus]" \
    --output table
---------------------------------------------------------------------------------
|                           DescribeAvailabilityZones                           |
+------------------------+------------------------+-------------+---------------+
|  ap-southeast-1-han-1a |  ap-southeast-1-han-1  |  local-zone |  not-opted-in |
+------------------------+------------------------+-------------+---------------+
```

Zone hiện ra đúng tên, loại `local-zone`, nằm dưới Region Singapore và đang `not-opted-in`. Group name là `ap-southeast-1-han-1`, đây là giá trị điền vào `<group-name>` trong lệnh opt-in ở trên.

📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/06/aws-local-zones-hanoi-vietnam/)

---

## Serverless

### Lambda Web Functions (12/10/2026)

Lambda giờ có ba kiểu function: Event Functions (kiểu handler cũ, được đổi tên), Web Functions và MicroVMs. Web Functions cho chạy thẳng một web app bình thường viết bằng Express, Hono, Fastify hay Next.js, không cần adapter như trước. App chỉ cần lắng nghe trên host và cổng lấy từ biến `AWS_LAMBDA_HTTP_ENDPOINT`:

```javascript
const [host, port] = process.env.AWS_LAMBDA_HTTP_ENDPOINT.split(':');
app.listen(port, host);
```

```bash
aws lambda-web deploy --name my-web-app --code ./my-app
```

Một môi trường xử lý được tối đa **128 request cùng lúc**. Tiền tính theo **thời gian CPU thực dùng**, nên lúc app chờ database hay chờ LLM trả lời thì gần như không bị tính tiền. Ngoài ra có thể chia traffic để chạy canary, deploy ra nhiều Region bằng cờ `--regions`, và đặt CloudFront phía trước.

**Lưu ý:** mới có Node.js 24 trên Arm64 ở 5 Region (N. Virginia, Ohio, Oregon, Tokyo, Ireland), **chưa có Singapore**. Bộ nhớ vẫn bị tính tiền suốt thời gian môi trường thực thi còn tồn tại, kể cả lúc rảnh không có request.

Thử thật bằng AWS CLI 2.38.5 ở Region N. Virginia, dùng app mẫu `--hello-world` có sẵn trong CLI:

```
$ aws lambda-web deploy --name blog-hello --hello-world --region us-east-1
Creating starter application in .\blog-hello ...
Creating deployment package ...
Preparing Amazon S3 bucket ...
Preparing AWS IAM execution role ...
Uploading deployment package ...
Creating Lambda Web Function ...
Waiting for endpoint to become active (timeout 600s) ...
Waiting for endpoint to become active (state Pending, 0s elapsed, timeout 600s) ...
Waiting for endpoint to become active (state Pending, 6s elapsed, timeout 600s) ...
Console: https://us-east-1.console.aws.amazon.com/lambda/home#/web-functions/blog-hello
https://wvcd77jh6fh1s2qc.32l.lambda-web.us-east-1.on.aws

$ aws lambda-web list-web-function-endpoints --name blog-hello --region us-east-1
aws: [ERROR]: An error occurred (ParamValidation): the following arguments are required: --function-name
...

$ aws lambda-web list-web-function-endpoints --function-name blog-hello --region us-east-1
{
    "endpoints": [
        {
            "endpointArn": "arn:aws:lambda:us-east-1:xxxxxxxxxxxx:web-function/blog-hello/endpoint/dev",
            "endpointName": "dev",
            "endpointType": "HomeRegion",
            "domainName": "wvcd77jh6fh1s2qc.32l.lambda-web.us-east-1.on.aws",
            "authType": "ApplicationManaged",
            "autoDeploymentMode": "LatestRevision",
            "revisionWeights": [
                {
                    "revisionId": "rev-4fbnn",
                    "weight": 100
                }
            ],
            ...
            "state": "Active",
            "stateReason": "The endpoint is active and invokable.",
            ...
        }
    ]
}

$ curl.exe -i -s https://wvcd77jh6fh1s2qc.32l.lambda-web.us-east-1.on.aws
HTTP/1.1 200 OK
Date: Mon, 26 Oct 2026 05:13:00 GMT
Content-Type: application/json
lambda-web-logstream: 2026/10/26/blog-hello[rev-4fbnn]29e9e71484ab46cbb5d2072c7809c001
Transfer-Encoding: chunked
lambda-web-request-id: C7D7JD4G4EBGFEVCPBDCNFW75I

{"message":"Hello from Lambda Web!","path":"/"}
```

Lệnh `deploy` chạy hết khoảng 30 giây, kể cả bước chờ endpoint chuyển từ `Pending` sang `Active`. Lệnh này tự tạo code mẫu trên máy, một S3 bucket chứa gói deploy và một IAM role. Endpoint mặc định tên `dev` và chuyển 100% traffic về revision `rev-4fbnn`. Gọi URL trả về `200 OK` cùng body JSON, header `lambda-web-logstream` cho biết log của request nằm ở đâu.

Có hai điểm cần chú ý khi chạy. `deploy` nhận `--name`, còn `list-web-function-endpoints` và `delete-web-function` chỉ nhận `--function-name`. Ngoài ra, `delete-web-function` không xoá S3 bucket và IAM role mà `deploy` đã tạo. Bucket này có bật versioning, nên `s3 rb --force` không xoá hết được.

Web Functions hợp với web app Node.js đang chạy trên Lambda qua adapter, nhất là app tốn nhiều thời gian chờ I/O, ở các Region đã hỗ trợ.

📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/announcing-aws-lambda-web-functions-for-fast-consistent-web-app-performance-anywhere/)

### EventBridge: enhanced custom event bus (24/9/2026)

EventBridge có thêm loại bus mới để cả organization dùng chung một bus trung tâm, chia sẻ qua AWS RAM thay vì phải nối nhiều bus với nhau. Bus mới giữ đúng thứ tự event theo `EventGroupId`, tự bỏ event trùng trong 5 phút, và gọi đồng bộ được tới target như Lambda nên nhiều trường hợp không cần SQS đứng giữa nữa. Filter, target, retry và DLQ được gom vào một tài nguyên tên là Subscriber.

Bus cũ vẫn chạy bình thường và nay gọi là "classic". Muốn dùng bus mới thì phải tự migrate. Giá tính theo lượng event vào và ra (ingress/egress). Đã có ở Singapore.

📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/introducing-enhanced-custom-event-buses-in-amazon-eventbridge-for-enterprise-scale-event-driven-applications/)

---

## Containers và IaC

### EKS: rollback phiên bản Kubernetes (1/7/2026)

EKS giờ cho quay lại phiên bản Kubernetes cũ sau khi nâng cấp. Trong **7 ngày** sau khi nâng, cluster có thể lùi về **một minor version trước** (ví dụ 1.35 về 1.34) mà không phải dựng lại, và không tốn thêm phí.

Control plane thì cluster nào cũng lùi được. Node chỉ lùi theo khi cluster chạy **EKS Auto Mode**, và quá trình này vẫn tôn trọng PodDisruptionBudget. Trước khi lùi, EKS chạy cluster insights để kiểm tra, muốn bỏ qua bước này thì thêm cờ `--force`.

Bài gốc không nói add-on hay node tự quản có lùi được không, nên đừng mặc định là cluster về được nguyên trạng.

📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/upgrade-amazon-eks-clusters-with-confidence-using-kubernetes-version-rollbacks/)

### CloudFormation Express mode (30/6/2026)

CloudFormation có thêm chế độ Express để deploy nhanh hơn. Thay vì chờ tài nguyên ổn định hẳn, Express coi như xong khi cấu hình đã được áp dụng, phần còn lại chạy tiếp ở nền. Theo AWS, deploy nhanh hơn tới 4 lần, ví dụ một SQS queue kèm DLQ giảm từ 64 giây xuống còn tối đa 10 giây. Template giữ nguyên, còn CDK thì dùng `cdk deploy --express`.

```bash
aws cloudformation create-stack \
  --stack-name my-app \
  --template-body file://template.yaml \
  --deployment-config '{"Mode": "EXPRESS", "DisableRollback": true}'
```

**Lưu ý:** Express **tắt rollback theo mặc định**. Trên production, đặt `"DisableRollback": false`. Nếu bước sau trong pipeline cần tài nguyên đã chạy thật, hãy giữ chế độ mặc định.

Thử thật bằng AWS CLI 2.38.5 ở Singapore, deploy hai lần cùng một template gồm một SQS queue và một DLQ, đo thời gian bằng `Measure-Command` của PowerShell:

```
$ $t = Measure-Command { aws cloudformation create-stack --stack-name demo-std --template-body file://demo/cfn-sqs.yaml | Out-Host; aws cloudformation wait stack-create-complete --stack-name demo-std }
{
    "StackId": "arn:aws:cloudformation:ap-southeast-1:xxxxxxxxxxxx:stack/demo-std/0d090660-d0fb-11f1-acf7-02fff6459c3d",
    "OperationId": "0d0a8d00-d0fb-11f1-acf7-02fff6459c3d"
}
$ "STD seconds: " + [math]::Round($t.TotalSeconds,1)
STD seconds: 93.1

$ aws cloudformation create-stack --stack-name demo-express --template-body file://demo/cfn-sqs.yaml --deployment-config file://demo/express.json
aws: [ERROR]: An error occurred (ParamValidation): Parameter validation failed:
Unknown parameter in DeploymentConfig: "mode", must be one of: Mode, DisableRollback
Unknown parameter in DeploymentConfig: "disableRollback", must be one of: Mode, DisableRollback

$ $t = Measure-Command { aws cloudformation create-stack --stack-name demo-express --template-body file://demo/cfn-sqs.yaml --deployment-config file://demo/express.json | Out-Host; aws cloudformation wait stack-create-complete --stack-name demo-express }
{
    "StackId": "arn:aws:cloudformation:ap-southeast-1:xxxxxxxxxxxx:stack/demo-express/4f9f88a0-d0fb-11f1-b035-0affd2e91de1",
    "OperationId": "4fa07300-d0fb-11f1-b035-0affd2e91de1"
}
$ "EXPRESS seconds: " + [math]::Round($t.TotalSeconds,1)
EXPRESS seconds: 153.1

$ aws cloudformation describe-stack-events --stack-name demo-express \
    --query "reverse(StackEvents)[].[Timestamp,LogicalResourceId,ResourceStatus]" --output text
2026-10-26T05:08:41.668000+00:00	demo-express	CREATE_IN_PROGRESS
2026-10-26T05:08:44.009000+00:00	DeadLetterQueue	CREATE_IN_PROGRESS
...
2026-10-26T05:09:45.692000+00:00	MainQueue	CREATE_IN_PROGRESS
2026-10-26T05:09:45.852000+00:00	DeadLetterQueue	CREATE_COMPLETE
...
2026-10-26T05:10:47.669000+00:00	MainQueue	CREATE_COMPLETE
2026-10-26T05:10:48.299000+00:00	demo-express	CREATE_COMPLETE

$ aws cloudformation describe-stacks --query "Stacks[?starts_with(StackName,'demo-')].[StackName,StackStatus]" --output table
-------------------------------------
|          DescribeStacks           |
+---------------+-------------------+
|  demo-express |  CREATE_COMPLETE  |
|  demo-std     |  CREATE_COMPLETE  |
+---------------+-------------------+
```

Lần chạy Express đầu tiên báo lỗi vì file cấu hình dùng khoá `mode` và `disableRollback`. AWS CLI 2.38.5 chỉ nhận `Mode` và `DisableRollback`, nên file được sửa thành `{ "Mode": "EXPRESS", "DisableRollback": true }` rồi chạy lại.

Số giây đo trên máy có sai số vì waiter của CLI chỉ hỏi trạng thái 30 giây một lần. Theo mốc thời gian trong stack events, stack Standard mất khoảng 67 giây (05:06:49 → 05:07:57), stack Express mất khoảng 127 giây (05:08:41 → 05:10:48). Ở lần chạy này, Express chậm hơn Standard, ngược với con số "tối đa 10 giây" AWS công bố. Events cho thấy DLQ và MainQueue được tạo nối tiếp nhau, mỗi queue mất khoảng 61 giây. `describe-stacks` của `demo-express` vẫn ghi `"Mode": "EXPRESS"` và lý do "Stack operation completed using Express Mode", nên stack đúng là chạy ở chế độ Express. Đây là kết quả của một lần chạy, chưa đủ để kết luận chung.

Express hợp với môi trường dev và test cần deploy lặp lại nhiều lần, nhưng nên đo trên template thật trước khi trông đợi vào mức tăng tốc.

📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/accelerate-your-infrastructure-deployments-by-up-to-4x-with-aws-cloudformation-express-mode/)

---

## Data và Storage

### DynamoDB có vector search (GA, 5/8/2026)

DynamoDB giờ tìm kiếm vector được ngay trong bảng. Embedding lưu trong item dưới dạng `List` các `Number` và ghi bằng `PutItem` như dữ liệu thường. Sau đó tạo vector index trên thuộc tính này rồi tìm bằng API `SearchVectors`. Mỗi vector tối đa 4.096 chiều, khoảng cách đo bằng Euclidean, Cosine hoặc Dot product, và mỗi lần tìm trả về tối đa 100 kết quả. Tiền tính theo request, có ở mọi Region thương mại.

Nhờ vậy, agent nào đang lưu memory trong DynamoDB thì tìm kiếm theo ngữ nghĩa được luôn, không cần đồng bộ sang một kho vector khác.

**Lưu ý:** mỗi lần tìm chỉ trong **một** giá trị partition key, và filter chỉ so khớp chính xác. Tính năng hợp với kiểu "tìm trong memory của user X", không hợp với kiểu "tìm trên toàn bộ tri thức công ty".

Thử thật bằng AWS CLI 2.38.5 ở Singapore. Bảng `blog-vectors` có 5 item cùng partition key `docs`, mỗi item mang một vector 3 chiều cho dễ đọc. Vector truy vấn `[0.85, 0.2, 0.05]` nằm gần nhóm "serverless":

```
$ aws dynamodb create-table --table-name blog-vectors \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST --vector-indexes file://demo/vector-index.json
{
    "TableDescription": {
        ...
        "TableStatus": "CREATING",
        ...
        "VectorIndexes": [
            {
                "IndexName": "doc-embedding-idx",
                ...
                "Dimensions": 3,
                "DistanceFunction": "COSINE",
                "IndexStatus": "CREATING",
                ...
            }
        ]
    }
}

$ Get-ChildItem demo\item-*.json | ForEach-Object { aws dynamodb put-item --table-name blog-vectors --item "file://demo/$($_.Name)" }

$ aws dynamodb describe-table --table-name blog-vectors \
    --query "[Table.TableStatus, Table.VectorIndexes[0].IndexStatus]" --output text
ACTIVE	ACTIVE

$ aws dynamodb search-vectors --table-name blog-vectors --index-name doc-embedding-idx \
    --search-vector file://demo/query-vector.json --top-k 3 \
    --search-condition-expression "pk = :pk" --expression-attribute-values file://demo/eav.json
{
    "SearchResults": [
        {
            "Item": {
                "sk": {
                    "S": "lambda"
                },
                ...
                "title": {
                    "S": "Lambda Web Functions"
                }
            },
            "Score": 0.008866806514561176
        },
        {
            "Item": {
                "sk": {
                    "S": "eventbridge"
                },
                ...
                "title": {
                    "S": "EventBridge enhanced bus"
                }
            },
            "Score": 0.009830087423324585
        },
        {
            "Item": {
                "sk": {
                    "S": "s3"
                },
                ...
                "title": {
                    "S": "S3 annotations"
                }
            },
            "Score": 0.5504862070083618
        }
    ]
}
```

Lambda và EventBridge đứng đầu đúng như dự đoán, S3 xếp thứ ba với khoảng cách xa hơn hẳn. `Score` là khoảng cách cosine, số càng nhỏ thì càng gần. Tính tay khoảng cách cosine giữa vector truy vấn và từng item cho đúng ba con số này. Graviton5 và DynamoDB không lọt vào top 3. Index đã `ACTIVE` ngay sau khi ghi xong 5 item, nên lệnh tìm không phải chờ. Kết quả trả về không kèm thuộc tính `embedding`, dù index khai báo `Projection` là `ALL`.

Vector search trong DynamoDB hợp với bài toán tìm theo ngữ nghĩa trong phạm vi một partition, ví dụ memory của một user hay tài liệu của một tenant.

📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/amazon-dynamodb-now-supports-real-time-vector-search-at-any-scale)

### S3 annotations (16/6/2026)

S3 có thêm annotation, một kiểu metadata mới gắn vào từng object. Mỗi object gắn được tối đa 1.000 annotation, mỗi cái 1 MB, tổng cộng 1 GB, ở dạng JSON, XML, YAML hoặc text. Annotation sửa hay xoá lúc nào cũng được mà không phải ghi lại object. Trước đây user metadata chỉ được 2 KB và không sửa được, còn tag thì tối đa 10 cái.

```bash
aws s3api put-object-annotation \
  --bucket my-media-bucket \
  --key videos/documentary-2026.mp4 \
  --annotation-name ai_summary \
  --annotation-payload ./ai_summary.txt
```

Nếu bật S3 Metadata annotation tables (định dạng Iceberg) thì có thể truy vấn annotation bằng Athena, kể cả khi object đã chuyển sang Glacier. Bảng này cập nhật khoảng mỗi giờ một lần. Annotation tính tiền theo **giá S3 Standard**, dù object đang nằm ở lớp lưu trữ nào.

Thử thật bằng AWS CLI 2.38.5 ở Singapore, gắn hai annotation vào object `reports/q3.txt` rồi đọc lại:

```
$ aws s3api put-object-annotation --bucket blog-demo-annot-29321 --key reports/q3.txt \
    --annotation-name ai_summary --annotation-payload demo/ai_summary.txt
{
    "ETag": "\"e2de635db043fe88a85b8d866368f1e8\"",
    "ChecksumCRC64NVME": "FF1j++LdE7I=",
    "ChecksumType": "FULL_OBJECT",
    "ServerSideEncryption": "AES256",
    "Key": "reports/q3.txt",
    "AnnotationName": "ai_summary"
}

$ aws s3api put-object-annotation --bucket blog-demo-annot-29321 --key reports/q3.txt \
    --annotation-name classification --annotation-payload demo/classification.txt
{
    "ETag": "\"419b065ca381e16bc66ad67c81f14696\"",
    ...
    "AnnotationName": "classification"
}

$ aws s3api list-object-annotations --bucket blog-demo-annot-29321 --key reports/q3.txt
{
    "Annotations": [
        {
            "AnnotationName": "ai_summary",
            "LastModified": "2026-10-26T05:06:36+00:00",
            ...
            "Size": 79
        },
        {
            "AnnotationName": "classification",
            "LastModified": "2026-10-26T05:06:37+00:00",
            ...
            "Size": 59
        }
    ],
    "AnnotationCount": 2,
    ...
}

$ aws s3api get-object-annotation --bucket blog-demo-annot-29321 --key reports/q3.txt \
    --annotation-name ai_summary out.txt
{
    "LastModified": "2026-10-26T05:06:36+00:00",
    "ContentLength": 79,
    ...
}

$ Get-Content out.txt
Tom tat: doanh thu Q3 tang 12% so voi Q2, mang serverless dong gop nhieu nhat.
```

Object `reports/q3.txt` nhận hai annotation riêng biệt. Mỗi annotation có ETag, checksum CRC64NVME và được mã hoá AES256 giống một object. `list-object-annotations` liệt kê đủ hai tên, kích thước 79 và 59 byte khớp với hai file nguồn. `get-object-annotation` ghi nội dung ra file `out.txt`, và file này chứa đúng câu tóm tắt đã gắn vào.

Annotation hợp với việc gắn kết quả xử lý của AI, nhãn phân loại hay thông tin sở hữu vào object mà không phải ghi lại object.

📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/amazon-s3-annotations-attach-rich-queryable-context-directly-to-your-objects/)

---

## AI và GenAI

### Bedrock AgentCore: từ "chạy được" tới "chạy production"

AgentCore là phần có nhiều cập nhật nhất trong giai đoạn này, chủ yếu để đưa agent lên production dễ hơn:

- **Harness (GA, 6/2026):** khai báo model, tool và skill bằng cấu hình, không phải tự viết vòng lặp điều phối.
- **Runtime Instances (8/2026):** máy EC2 do AWS quản lý, dành cho agent cần chạy nhiều ngày (session tối đa 14 ngày) hoặc cần GPU. Có ở Singapore.
- **Runtime thế hệ mới (9/2026):** theo thử nghiệm của AWS, cold start P75 còn khoảng 2 giây, trong khi bản cũ mất từ 5,4 tới gần 30 giây.
- **Temporal policies (8/2026):** cho phép hay chặn hành động dựa trên những gì agent đã làm trước đó trong session, ví dụ "đã đọc dữ liệu khách hàng thì không được gửi email ra ngoài". Tính năng này dùng Dogwood, ngôn ngữ mã nguồn mở mở rộng từ Cedar.
- **Web Search và Managed Knowledge Base (6/2026):** agent tìm được thông tin trên web có kèm nguồn, và có RAG do AWS quản lý trọn gói.

📄 [Harness](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-harness-is-now-generally-available-go-from-idea-to-production-grade-agent-in-minutes/) · [Runtime Instances](https://aws.amazon.com/blogs/aws/runtime-instances-persistent-compute-for-production-ai-agents-on-amazon-bedrock-agentcore/) · [Runtime mới](https://aws.amazon.com/blogs/machine-learning/the-new-agentcore-runtime-elastic-optimized-and-consistently-fast-starts/) · [Temporal policies](https://aws.amazon.com/about-aws/whats-new/2026/08/temporal-policies-agentcore/) · [Web Search](https://aws.amazon.com/blogs/aws/announcing-web-search-on-amazon-bedrock-agentcore-ground-your-ai-agents-in-current-accurate-web-knowledge)

---

## Bảo mật và vận hành

### AWS Continuum (Preview có kiểm soát, 6/2026)

Continuum là ra mắt chính tại keynote Summit New York. Dịch vụ này gom các finding bảo mật từ khắp hệ thống, xếp ưu tiên theo mức ảnh hưởng tới nghiệp vụ, **kiểm tra xem lỗ hổng có khai thác được thật không**, rồi đẩy việc sửa vào quy trình mà đội đang dùng.

AWS Security Agent nay cũng nằm trong Continuum. Nó hỗ trợ threat modeling theo STRIDE, quét pull request và tích hợp vào IDE qua Kiro, Claude Code và MCP. Tháng 10, Continuum có thêm pentest chạy trong CI/CD (public preview).

📄 [Security Blog](https://aws.amazon.com/blogs/security/introducing-aws-continuum-security-at-machine-speed/)

### CloudWatch Omni (22/9/2026)

CloudWatch Omni là lớp observability mới, xây trên OpenTelemetry. Mỗi tổ chức có một URL riêng, người dùng đăng nhập qua IAM Identity Center và **không cần quyền vào AWS Console**. Mỗi đội gom ứng dụng và dữ liệu giám sát của mình vào một "Space". Omni tự vẽ sơ đồ phụ thuộc giữa các dịch vụ, và có DevOps Agent để hỏi đáp bằng ngôn ngữ tự nhiên khi điều tra sự cố.

Omni bổ sung cho CloudWatch chứ không thay thế, nên alarm và dashboard cũ vẫn giữ nguyên. Admin cần cấu hình domain, IdP và Space trước khi dùng. Bài công bố không ghi rõ đây là GA hay preview.

📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/introducing-amazon-cloudwatch-omni-collaborative-ai-powered-observability-for-your-applications/)

### EC2 application status checks (10/8/2026)

Status check cũ của EC2 không phát hiện được trường hợp máy vẫn chạy nhưng ứng dụng đã chết, ví dụ nginx bị tắt. Application status check giải quyết đúng việc này. Bạn khai báo protocol, port, path và mã HTTP được coi là bình thường, rồi gắn check vào instance theo ID hoặc tag. EC2 kiểm tra mỗi 60 giây, và Auto Scaling group dựa vào kết quả này để thay instance có ứng dụng bị lỗi. Tính năng đã có ở mọi Region thương mại.

```bash
aws ec2 create-application-status-check \
  --protocol http --port 80 --path "/" --status-code-matcher "200"

aws ec2 associate-application-status-check \
  --application-status-check-id <asc-id> --instance-ids <instance-id>
```

Check chỉ nhìn mã HTTP trả về, nên trỏ path vào một endpoint health riêng có kiểm tra các phụ thuộc sẽ tốt hơn trỏ vào trang chủ.

📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-ec2-application-status-checks/)

---

## Compute và chi phí

### Graviton5 đã đủ ba dòng chính

Đầu năm, Graviton5 mới có bản preview trên M9g. Đến nay đã có đủ ba dòng chính:

- **M9g/M9gd** (GA, 6/2026): dòng đa dụng, nhanh hơn tới 25% so với Graviton4.
- **C9g/C9gd** (7/2026): dòng tối ưu cho tính toán.
- **R9g/R9gd** (GA, 8/2026): dòng tối ưu cho bộ nhớ.

Graviton dùng kiến trúc Arm64, nên image container và các thư viện native cần có bản build cho Arm trước khi chuyển.

Thử thật bằng AWS CLI 2.38.5, chỉ chạy lệnh tra cứu, không tạo instance:

```
$ aws ec2 describe-instance-types --region ap-southeast-1 \
    --filters "Name=instance-type,Values=m9g.*,c9g.*,r9g.*" \
    --query "InstanceTypes[].InstanceType"
[
    "c9g.xlarge",
    "m9g.16xlarge",
    "c9g.2xlarge",
    "c9g.8xlarge",
    "c9g.large",
    "m9g.48xlarge",
    ...
    "m9g.metal-48xl",
    ...
    "c9g.metal-48xl"
]

$ aws ec2 describe-instance-types --region ap-southeast-1 \
    --filters "Name=instance-type,Values=r9g.*" --query "InstanceTypes[].InstanceType"
[]

$ aws ec2 describe-instance-types --region us-east-1 \
    --filters "Name=instance-type,Values=r9g.*" --query "sort(InstanceTypes[].InstanceType)"
[
    "r9g.12xlarge",
    "r9g.16xlarge",
    ...
    "r9g.metal-48xl",
    "r9g.xlarge"
]
```

Singapore đã có 11 size M9g và 11 size C9g, từ `medium` tới `metal-48xl`, nhưng chưa có R9g nào; R9g có ở N. Virginia (us-east-1) với 11 size.

📄 [M9g](https://aws.amazon.com/blogs/aws/now-available-amazon-ec2-m9g-and-m9gd-instances-powered-by-new-aws-graviton5-processors/) · [C9g](https://aws.amazon.com/blogs/aws/amazon-ec2-c9g-and-c9gd-instances-powered-by-aws-graviton5-processors-are-now-available/) · [R9g](https://aws.amazon.com/blogs/aws/amazon-ec2-r9g-and-r9gd-instances-powered-by-aws-graviton5-processors-are-now-generally-available/)

### Direct Connect: giá trọn gói (15/9/2026)

Kết nối Direct Connect **dedicated 10 Gbps và 100 Gbps** giờ có thể trả một khoản cố định mỗi tháng. Mức giá tính theo băng thông và phạm vi địa lý, chia thành 5 tier. Data transfer out trong phạm vi tier đã chọn không bị tính thêm, và mỗi kết nối có thể đổi cách tính giá bất cứ lúc nào.

Traffic ra ngoài phạm vi tier vẫn tính theo giá DTO thông thường, nên cần tính theo lưu lượng thực tế trước khi chuyển.

📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/09/aws-direct-connect-announces-flat-rate-pricing/)

---

## Điểm nhanh

Một số cập nhật nhỏ hơn, mỗi cái gói trong một dòng.

**Serverless và containers**

- **Lambda Durable Execution SDK:** đã có cho .NET (GA, 7/2026) và Go (GA, 10/2026). Bản Go có `durabletest` để test workflow ngay trên máy. 📄 [Go](https://aws.amazon.com/about-aws/whats-new/2026/10/aws-lambda-durable-go-sdk-support/) · [.NET](https://aws.amazon.com/about-aws/whats-new/2026/07/lambdadf-dotnet/)
- **Lambda SnapStart:** giờ chạy được với function dạng container image (Java, Python, .NET). 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/07/aws-lambda-snapstart-container/)
- **Lambda Managed Instances:** timeout tăng lên 90 phút cho gọi bất đồng bộ và event source mapping. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/09/aws-lambda-90-minute-function/)
- **Lambda ngoài VPC:** băng thông lên tới 3.000 Mbps ở mức 10 GB RAM. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/08/aws-lambda-network-bandwidth/)
- **ECS:** có metric 20 giây để scale-out nhanh hơn, và tự thay instance khi agent mất kết nối. 📄 [Scaling](https://aws.amazon.com/blogs/aws/amazon-ecs-introduces-new-high-resolution-metrics-for-faster-service-auto-scaling/) · [Agent](https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-ecs-agent-connectivity-health/)
- **Phí quản lý GPU** trên EKS Auto Mode và ECS Managed Instances giảm 35–60%. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-ecs-managed-instances-gpu-price/)

**Data**

- **S3** cho chuyển object sang Standard-IA và One Zone-IA ngay từ ngày đầu, không phải chờ 30 ngày. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/07/s3-removes-30-day-transitions-standard-ia-one-zone-ia/)
- **Iceberg V3** đã có ở S3 Tables, Redshift và Glue 6.0 (Glue 6.0 rẻ hơn 30%). Aurora PostgreSQL truy vấn thẳng được file Iceberg và Parquet. 📄 [S3 Tables](https://aws.amazon.com/blogs/aws/amazon-s3-tables-now-support-all-apache-iceberg-v3-data-types/) · [Glue 6.0](https://aws.amazon.com/blogs/aws/aws-glue-6-0-now-available-with-30-lower-price-and-full-apache-iceberg-v3-support/) · [Aurora](https://aws.amazon.com/blogs/aws/amazon-aurora-postgresql-now-supports-direct-querying-of-apache-iceberg-and-parquet-data-in-your-data-lake/)
- **Aurora DSQL** có CDC để đẩy thay đổi sang Kinesis (GA). 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-aurora-dsql-cdc-ga/)
- **DuckLabs:** AWS ký thỏa thuận mua lại công ty đứng sau DuckDB. DuckDB vẫn là mã nguồn mở. 📄 [Big Data Blog](https://aws.amazon.com/blogs/big-data/aws-and-ducklabs-building-the-future-of-analytics-together/)

**AI**

- **Model mới trên Bedrock:**
  - Anthropic: Claude Sonnet 5, Opus 5, Fable 5.1 và dòng 5.5
  - OpenAI: GPT-5.6, GPT-6 Astra/Sol/Luna
  - Khác: Gemma 4, Kimi K3, Grok, Nova 2.5 Sonic

  Fable 5.1 bắt buộc dùng chế độ lưu dữ liệu `aws_review` (giữ tối đa 30 ngày), nên tổ chức có chính sách dữ liệu chặt cần duyệt trước khi bật. 📄 [Fable 5.1](https://aws.amazon.com/blogs/machine-learning/introducing-claude-fable-5-1-on-aws/)
- **AWS Agent Registry (GA):** danh mục nội bộ để quản lý agent, tool và MCP server. 📄 [ML Blog](https://aws.amazon.com/blogs/machine-learning/manage-agents-tools-and-skills-at-scale-with-aws-agent-registry/)
- **Bedrock Managed Agents powered by OpenAI (preview):** agent chạy trong account của bạn, dưới quyền IAM sẵn có. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/09/bedrock-managed-agents-preview/)

**Bảo mật và vận hành**

- **Security Hub:** dò từ Internet xem tài nguyên nào truy cập được thật, và giám sát được cả Azure. 📄 [Network Scanning](https://aws.amazon.com/about-aws/whats-new/2026/07/aws-security-hub-network-scanning/) · [Azure](https://aws.amazon.com/about-aws/whats-new/2026/06/aws-security-hub-supports-monitoring-microsoft-azure/)
- **GuardDuty:** phân tích truy vấn trên RDS/Aurora PostgreSQL để phát hiện truy cập dữ liệu bất thường. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/10/guardduty-rds-data-exfiltration/)
- **ACM:** hỗ trợ ACME, nên cấp chứng chỉ được bằng các client chuẩn. 📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/automate-public-tls-certificate-issuance-with-acme-support-in-aws-certificate-manager/)
- **AWS Health version catalog:** tra được ngày hết hỗ trợ của các phiên bản trên RDS, EKS và Lambda. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/10/aws-health-introduces-version-catalog-software-lifecycle-management/)
- **CloudWatch:** tạo alarm thẳng từ log query. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-cloudwatch-log-alarms/)

**Compute và chi phí**

- **EC2 T8i (GA):** dòng burstable chạy Intel Xeon thế hệ 6. `t8i.micro` và `t8i.small` nằm trong Free Tier. 📄 [AWS News Blog](https://aws.amazon.com/blogs/aws/new-low-cost-burstable-amazon-ec2-t8i-instances-are-generally-available/)
- **S3 Vectors:** phí query giảm tới 80% với index lớn. 📄 [What's New](https://aws.amazon.com/about-aws/whats-new/2026/06/s3-vectors-reduces-query-charges-80-percent-large-indexes/)
- **FinOps Agent và Well-Architected Agent (preview):** đưa ra đề xuất về chi phí và kiến trúc. Nên coi đó là gợi ý để người xem xét, không để agent tự áp dụng. 📄 [FinOps](https://aws.amazon.com/about-aws/whats-new/2026/06/aws-finops-agent-preview/) · [Well-Architected](https://aws.amazon.com/blogs/aws/announcing-aws-well-architected-agent-an-ai-powered-intelligence-to-optimize-your-cloud-environment-preview/)

---

## Lifecycle: những thứ sắp ngừng

Mỗi quý AWS đều công bố danh sách dịch vụ thay đổi vòng đời. Giai đoạn này có hai đợt, ngày 30/6 và 29/9/2026. Hai mốc gần nhất cần để ý:

- **29/10/2026:** Chime SDK SIP Media Application và WorkSpaces Secure Browser ngừng nhận khách hàng mới.
- **7/12/2026:** console riêng của Infrastructure Composer hết hỗ trợ.

| Dịch vụ / tính năng | Trạng thái | Mốc thời gian |
|---|---|---|
| Bedrock Agents (nay là "Agents Classic"), Kendra, Q Business, Cognito Sync, Simple AD | Maintenance | Không nhận khách mới từ 30/7/2026 |
| SageMaker AI: A2I, Clarify, Debugger, Ground Truth, Model Monitor, Studio Lab… | Maintenance | 30/7/2026 |
| Chime SDK SIP Media Application, WorkSpaces Secure Browser | Maintenance | Không nhận khách mới từ 29/10/2026 |
| **Infrastructure Composer (console riêng)** | Sunset | **Hết hỗ trợ 7/12/2026** |
| Managed Blockchain, DevOps Guru | Sunset | Hết hỗ trợ 29–30/9/2027 |
| WorkSpaces PCoIP, WorkSpaces Pools, re:Post Private | Sunset | Xem thông báo của từng dịch vụ |
| Amazon Mechanical Turk | **Đã hết hỗ trợ** | 29/9/2026 |
| ACM email validation | Khai tử dần | Request mới: 31/3/2027 · Ngừng gia hạn: 30/9/2027 |
| AWS CLI v1 | Maintenance | Chỉ còn sửa lỗi nghiêm trọng và lỗi bảo mật |

Cách đọc bảng:

- **Maintenance:** khách hàng cũ vẫn dùng tiếp, nhưng account mới không bật được và dịch vụ không có thêm tính năng mới.
- **Sunset:** đã có ngày tắt cụ thể, nên dành 6–12 tháng để migrate.

Với ACM, có thể chuyển chứng chỉ sang DNS validation bằng API `UpdateCertificateOptions` mà **ARN vẫn giữ nguyên**.

📄 [Đợt 30/6](https://aws.amazon.com/blogs/aws/aws-weekly-roundup-claude-sonnet-5-on-aws-amazon-workspaces-for-ai-agents-aws-service-availability-updates-and-more-july-6-2026/) · [Đợt 29/9](https://aws.amazon.com/about-aws/whats-new/2026/09/aws-service-availability/) · [ACM](https://aws.amazon.com/blogs/security/aws-certificate-manager-will-discontinue-email-validation-to-prove-domain-validation-for-certificates/)

---

## Tóm lại

Nếu chỉ có thời gian làm ba việc trong tuần này thì nên làm:

1. **Rà bảng lifecycle** xem có đang dùng Bedrock Agents Classic, Kendra, Infrastructure Composer, hay chứng chỉ ACM validate bằng email không.
2. **Nếu khách hàng ở Việt Nam,** đánh giá Local Zone Hà Nội cho workload cần độ trễ thấp hoặc phải lưu dữ liệu trong nước.
3. **Nếu đang chạy web app trên Lambda qua adapter,** theo dõi Web Functions, nhất là khi nào nó có ở Singapore.

re:Invent 2026 sẽ diễn ra trong vài tuần tới. Hẹn gặp lại ở bài tổng hợp tiếp theo.

*Nguồn chính: các bản [AWS Weekly Roundup](https://aws.amazon.com/blogs/aws/tag/week-in-review/) từ 15/6 đến 19/10/2026, bài [Top announcements of the AWS Summit in New York, 2026](https://aws.amazon.com/blogs/aws/top-announcements-of-the-aws-summit-in-new-york-2026/) và các trang What's New dẫn trong bài.*
