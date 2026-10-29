# Azure Pipelines authoring contracts

`project.proto` owns `AdoProject`; generated runtime records live in
`src/_generated/project_pb.ts`. `project.cue` and its valid/invalid fixtures pin
the version, self-hosted pool, unique demands, literal workspace-relative plan path
and artifact prefix, including conflicts with the initial Linux requirement.
`parseAdoProject` applies these constraints to derive the immutable parsed type.

The referenced command plan and execution result use `@hobo/ci` Protobuf/CUE
contracts. This package defines no credentials, account balances, leases or
remote pipeline registration records. Its consumer Pact covers the YAML boundary;
no live provider verification is implied.
