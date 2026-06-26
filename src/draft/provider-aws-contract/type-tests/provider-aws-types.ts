import { aws, createAwsProvider, type AwsProvider } from "../src/provider-aws.mjs";

const provider: AwsProvider = createAwsProvider();
const rds = aws.with.rds({ engine: "postgres", instanceClass: "db.t4g.medium", storageGb: 50 });
const fargate = aws.with.fargate({ cpu: 512, memoryMb: 1024, publicIngress: false });
const client = provider.client("database", {
  endpoint: "postgres://fixture",
  arn: "arn:aws:rds:us-east-1:123:cluster:orders",
  secretRef: "svid://token/orders"
});

rds.options.storageGb satisfies number;
fargate.options.memoryMb satisfies number;
client.connectionString satisfies string;

// @ts-expect-error RDS options reject untyped option escape hatches.
aws.with.rds({ rawTerraformResourceType: "aws_db_instance" });

// @ts-expect-error client is typed to declared AWS ports only.
provider.client("email", {});
