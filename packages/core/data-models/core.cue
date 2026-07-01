package data_models

#CoreScaffoldRecord: {
  package_name: string & =~"^@hobo/"
  owner_issue:  string & !=""
}
