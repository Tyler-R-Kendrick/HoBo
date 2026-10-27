package vercel

#HostedQueueWakeup: {
  deliveryId: string & !=""
  source?: _|_
  name?: _|_
  ...
}

#HostedQueueRepair: {
  source: "static" | "hobo-ci"
  name: "hobo-ci-repair"
  deliveryId?: _|_
  ...
}

#Queue: #HostedQueueWakeup | #HostedQueueRepair
