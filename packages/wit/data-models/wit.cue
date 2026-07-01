package data_models

#WitScaffoldRecord: {
  package_name: string & =~"^@hobo/"
  owner_issue:  string & !=""
}
