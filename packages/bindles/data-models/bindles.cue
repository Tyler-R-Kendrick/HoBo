package data_models

#BindlesScaffoldRecord: {
  package_name: string & =~"^@hobo/"
  owner_issue:  string & !=""
}
