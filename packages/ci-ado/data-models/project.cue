package project

import "list"

#AdoProject: {
 schemaVersion: "hobo.ci.ado/v1"
 pool: string & =~"^[A-Za-z0-9_]([A-Za-z0-9_. -]{0,98}[A-Za-z0-9_.-])?$" & !~"(?i)^azure pipelines$"
 demands?: [...#Demand] & list.MaxItems(16) & list.UniqueItems()
 pipelinePath: string & =~"^[A-Za-z0-9_.-][A-Za-z0-9_./-]{0,499}$" & !~"(^|/)[.]{1,2}(/|$)" & !~"//|/$"
 artifactPrefix: string & =~"^[A-Za-z0-9_-]{1,64}$"
}

#Project: #AdoProject

#Demand: string & =~"^[A-Za-z][A-Za-z0-9_.-]*( -equals [A-Za-z0-9_.-]+)?$" & (!~"(?i)^Agent[.]OS($| )" | "Agent.OS -equals Linux")
