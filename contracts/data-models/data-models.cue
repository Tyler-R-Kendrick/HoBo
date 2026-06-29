package datamodels

#DataModel: {
	contractId:       =~"^hobo\\.datamodel\\.[a-z0-9-]+\\.[a-z0-9-]+$"
	protobufMessage:  =~"^[A-Z][A-Za-z0-9]+DataModel$"
	protobufPackage:  "hobo.datamodels.v1"
	cueDefinition:    =~"^#[A-Z][A-Za-z0-9]+DataModel$"
	sourcePath:       =~"^src/draft/.+/src/.+\\.ts$"
	packageName:      =~"^[a-z0-9][a-z0-9-]+$"
	domain:           =~"^[a-z0-9][a-z0-9-]+$"
	integrationBoundaries: [..."module" | "contract" | "test" | "provider" | "event" | "persistence" | "cli" | "api"]
	cueAnnotated:     true
}

#Catalog: {
	entries: [...#DataModel]
	entries: [#AcmeDns01CertIssuanceContractAcmeDns01CertIssuanceDataModel, #ActorHostRuntimePortContractActorHostRuntimePortDataModel, #AdoptInPlaceContractAdoptInPlaceContractDataModel, #AlertmanagerRoutingContractAlertmanagerRoutingDataModel, #AnonymousPreviewPathContractAnonymousPreviewPathDataModel, #AppDevJourneyContractAppDevJourneyDataModel, #ArtifactRepoPortContractArtifactRepoPortDataModel, #AuthFlagReadsetContractAuthFlagReadsetDataModel, #AuthPortRbacResolutionContractAuthPortRbacResolutionDataModel, #AuthorTimeCapabilityFeedbackContractAuthorTimeCapabilityFeedbackDataModel, #AutonomousDriftRemediationContractAutonomousDriftRemediationDataModel, #AvailabilityViewContractAvailabilityViewDataModel, #BillingLaunchPolicyContractBillingLaunchPolicyDataModel, #BindReferenceWiringContractBindReferenceContractDataModel, #BudgetQuotaPolicyContractBudgetQuotaPolicyDataModel, #BuildDaggerProviderContractBuildDaggerProviderDataModel, #BuildWasmProviderContractBuildWasmProviderDataModel, #BuiltInFlagStoreContractBuiltInFlagStoreDataModel, #BuiltInOptoTrainingEngineContractBuiltInOptoTrainingEngineDataModel, #BuiltInPolicyEngineContractBuiltInPolicyEngineDataModel, #CampEventstoreRuntimePortContractCampEventstoreRuntimePortDataModel, #CampMappingSugarCompilerCampMappingSugarCompilerDataModel, #CanDeployCompatibilityGateContractCompatibilityGateDataModel, #CapabilityEnforcementContractCapabilityEnforcementDataModel, #CapabilityIndexedDiscoveryContractCapabilityIndexedDiscoveryDataModel, #CapabilityNegotiationContractCapabilityNegotiationDataModel, #CapabilitySpecContractCapabilitySpecDataModel, #ChampionChallengerPromotionContractChampionChallengerPromotionDataModel, #ChaosExperimentOrchestrationContractChaosExperimentOrchestrationDataModel, #ChoreographedCompensationContractChoreographedCompensationDataModel, #ChoreographySagaEngineContractChoreographySagaEngineDataModel, #CiFabricOidcE2eContractCiFabricContractDataModel, #CliCredentialHardeningContractCliCredentialHardeningDataModel, #ClientOptimisticUpdateContractClientOptimisticUpdateContractDataModel, #ClosureBuilderPublicApiContractClosureBuilderPublicApiDataModel, #CollectionCoverageGateContractCollectionCoverageGateDataModel, #CompensationEscalationContractCompensationEscalationDataModel, #ComponentHostAdapterCertificationSpikeComponentHostAdapterCertificationDataModel, #ComponentHostConformanceSuiteComponentHostConformanceDataModel, #ComponentHostOciFloorContractComponentHostOciFloorDataModel, #ConformancePortSuiteContractConformancePortSuiteDataModel, #ConnectivityCostFeedbackContractConnectivityCostFeedbackDataModel, #ConnectivityPolicyEnforcementContractConnectivityPolicyEnforcementDataModel, #ConnectivityTierIrContractConnectivityTierIrDataModel, #ContractEnginePortContractContractEngineDataModel, #ControlPlaneActionTaxonomyContractControlPlaneActionTaxonomyDataModel, #ControlPlaneAuthzCacheContractControlPlaneAuthzCacheDataModel, #ControlPlaneEventSchemaContractControlPlaneEventsDataModel, #ControlPlanePolicyBypassGuardControlPlanePolicyBypassGuardDataModel, #CostDegradationSagaContractCostDegradationSagaDataModel, #CostRoutingEligibilityContractCostRoutingEligibilityDataModel, #CostSignalContractCostSignalContractDataModel, #CqrsCommandAggregateContractCqrsCommandAggregateContractDataModel, #CreditLedgerViewContractCreditLedgerViewDataModel, #CrewEventContractCrewEventContractDataModel, #CrossCampBoundedStalenessContractCrossCampBoundedStalenessDataModel, #CrossCampFlagStateConsistencyContractCrossCampFlagStateConsistencyDataModel, #CrossCampRoutingPolicyContractCrossCampRoutingPolicyDataModel, #CrossCloudEquivalenceModelResolverDataModel, #CrossLayerGeneratedStackPropagationContractCrossLayerGeneratedStackPropagationDataModel, #CrossYardPolicyAttestationContractCrossYardPolicyAttestationDataModel, #CryptoShredErasureContractCryptoShredErasureContractDataModel, #CuratedCatalogPolicyContractCuratedCatalogPolicyDataModel, #DataFlywheelPrivacySpikePrivacyModelDataModel, #DataGovernancePolicyContractDataGovernancePolicyDataModel, #DataParadigmAuthoringContractDataParadigmAuthoringDataModel, #DefaultReadSurfaceContractDefaultReadSurfaceDataModel, #DefaultRoleActionMatrixContractDefaultRoleActionMatrixDataModel, #DeliveryExperimentAdapterConformanceSuiteHarnessAdapterConformanceDataModel, #DeliveryOrchestratorSkeletonContractDeliveryOrchestratorDataModel, #DeltaSetApplyReconcileContractDeltaSetApplyReconcileDataModel, #DenyCeilingAlgebraPocDenyCeilingAlgebraDataModel, #DeploymentPlanIrContractDeploymentPlanIrDataModel, #DeploymentStrategySagaTemplatesContractDeploymentStrategySagaTemplatesDataModel, #DeploymentViewSagaGraphContractDeploymentViewDataModel, #DevopsCanaryRolloutJourneyContractDevopsCanaryRolloutJourneyDataModel, #DevopsSelfHostYardJourneyContractDevopsSelfHostYardJourneyDataModel, #DisasterRecoveryFailoverContractDisasterRecoveryFailoverDataModel, #DispatcherMaximizeCreditsContractDispatcherDataModel, #DistributedArtifactResolverContractDistributedArtifactResolverDataModel, #DistributedArtifactVersionPolicyVersionPolicyDataModel, #DnsValidationGateThreatModelThreatModelDataModel, #DnsValidationRebindingGuardContractDnsValidationRebindingGuardDataModel, #DocumentProjectionSinkContractDocumentProjectionSinkDataModel, #DomainCutoverSagaContractDomainCutoverSagaDataModel, #DomainEventBodyContractDomainEventBodyContractDataModel, #DomainValidationGateContractDomainValidationGateDataModel, #DrFailoverIntegrityContractDrFailoverIntegrityDataModel, #DriftDetectionLoopContractDriftDetectionLoopDataModel, #DriftOrphanSweepContractDriftOrphanSweepDataModel, #DriverDispatchRoutingContractDriverDispatchRoutingDataModel, #EndUserAuthorizationPolicyContractEndUserAuthorizationPolicyDataModel, #EndpointMonitorOperatorContractEndpointMonitorOperatorDataModel, #ErrorBudgetDeployGateContractErrorBudgetDeployGateDataModel, #EvalPromotionGateContractEvalPromotionGateDataModel, #EventBodyUpcasterGateEventBodyUpcasterGateDataModel, #ExampleAppsScopeAcceptanceExampleAppsScopeDataModel, #ExecutionHostProviderContractExecutionHostProviderDataModel, #ExecutorSkeletonContractExecutorSkeletonDataModel, #ExperimentStatisticalAnalysisContractExperimentStatisticalAnalysisDataModel, #FailureTaxonomySafeFixClassifierFailureTaxonomyClassifierDataModel, #FeatureFlagGovernanceContractFeatureFlagGovernanceDataModel, #FederatedPolicyPackConflictContractFederatedPolicyPackConflictDataModel, #FlagDebtAutoCleanupContractFlagDebtAutoCleanupDataModel, #FlagEventContractFlagEventContractDataModel, #FlagPartitionConsistencyContractFlagPartitionConsistencyDataModel, #FlagRulesetSyncContractFlagRulesetSyncDataModel, #FullTextSearchContractFullTextSearchContractDataModel, #GatedAutonomousRemediationContractGatedAutonomousRemediationDataModel, #GatekeeperVerifyContractGatekeeperVerifyDataModel, #GatewayRealizationContractGatewayRealizationDataModel, #GenerateproviderCorrectnessSpikeCorrectnessSpikeDataModel, #GenerationBoundedRepairLoopContractBoundedRepairLoopDataModel, #GenerationCertifyStageContractCertifyStageDataModel, #GenerationEvalMethodologySpikeMethodologyDataModel, #GenerationLlmFillContractFillDataModel, #GenerationMaterialSanitizationContractMaterialSanitizationDataModel, #GenerationPipelineIoContractContractDataModel, #GenerationPromotionPolicyGateContractPromotionGateDataModel, #GenerationProviderLoopContractGenerateProviderDataModel, #GenerationReferenceRunContractGenerationReferenceRunDataModel, #GenerationSafetyGateContractSafetyGateDataModel, #GenerationScaffoldStageContractScaffoldDataModel, #GenerationValidationStageContractValidationStageDataModel, #GenesisBreakglassContractGenesisBreakglassDataModel, #GitopsCiJourneyContractGitopsCiJourneyDataModel, #GoldenSuiteChaosVerificationContractGoldenSuiteChaosVerificationDataModel, #GovernanceConformanceSuiteContractGovernanceConformanceSuiteDataModel, #GraphqlFacadeGenerationPocGraphqlFacadeGeneratorDataModel, #GraphqlFacadeRuntimeContractGraphqlFacadeRuntimeDataModel, #GuardrailPolicyGateContractGuardrailPolicyGateDataModel, #HoboAddInstallVerificationContractHoboAddInstallVerificationDataModel, #HoboAsyncBuildingBlockPortsContractDataModel, #HoboAuthAuthoringSurfaceAuthAuthoringSurfaceDataModel, #HoboAuthConsumerContractAuthConsumerContractDataModel, #HoboAuthFederateVerifyContractAuthFederateVerifyDataModel, #HoboAuthJsonContractAuthJsonDataModel, #HoboBindlesResourceCatalogCatalogDataModel, #HoboBuildCliContractBuildCliContractDataModel, #HoboCliShellContractCliShellDataModel, #HoboCodeDslContractHoboCodeDslDataModel, #HoboCodegenCliContractCodegenCliContractDataModel, #HoboCollectCliContractCollectCliDataModel, #HoboComponentizeContractComponentizeContractDataModel, #HoboConfigSecretSchemaContractConfigSchemaDataModel, #HoboContractIrContractIrDataModel, #HoboCoreContractCoreContractDataModel, #HoboDeliveryPortDeliveryContractDataModel, #HoboDevFidelityDriftContractDevFidelityDriftDataModel, #HoboDevLoopContractDevLoopDataModel, #HoboDnsPortContractDnsPortDataModel, #HoboDoctorContractDoctorContractDataModel, #HoboDownLifecycleContractDownLifecycleDataModel, #HoboExperimentPortExperimentContractDataModel, #HoboFeatureFlagPortEvaluatorDataModel, #HoboGatewayPortGatewayContractDataModel, #HoboInspectProjectionContractInspectContractDataModel, #HoboJwtSvidContractJwtSvidDataModel, #HoboLoginClaimContractLoginClaimContractDataModel, #HoboLogsCliContractLogsCliDataModel, #HoboManifestContractManifestDataModel, #HoboMcpServerContractMcpServerContractDataModel, #HoboMcpServerContractMcpSvidAuthDataModel, #HoboMonorepoSkeletonContractMonorepoSkeletonContractDataModel, #HoboNewScaffoldContractScaffoldDataModel, #HoboPackageNamespaceMapPackageNamespaceMapDataModel, #HoboPlanPreviewContractPlanPreviewDataModel, #HoboPolicyIrContractPolicyIrDataModel, #HoboPrincipalRefContractPrincipalRefDataModel, #HoboProjectionPortContractProjectionContractDataModel, #HoboRealizeEmissionContractRealizeEmissionContractDataModel, #HoboRelayContractHoboRelayDataModel, #HoboRemediationActionContractRemediationActionContractDataModel, #HoboRuntimePrimitivesRuntimePrimitivesDataModel, #HoboSdkAggregateWitContractReverseExtractionDataModel, #HoboUpConvergenceContractUpConvergenceDataModel, #HoboWitToolchainContractWitToolchainContractDataModel, #HostVersionUpgradeContractHostVersionUpgradeDataModel, #HumanApprovalGenerationGateContractHumanApprovalGenerationGateDataModel, #HumanOperatorConsoleContractHumanOperatorConsoleDataModel, #IacCdktfImportOnlyContractCdktfImportOnlyDataModel, #IacCrossplaneBackendContractCrossplaneIacBackendContractDataModel, #IacDriftRefreshFidelityContractIacDriftRefreshFidelityDataModel, #IacOpentofuBackendContractOpentofuIacBackendContractDataModel, #IacPartialApplyCompensationContractIacPartialApplyCompensationDataModel, #IacPulumiBackendContractPulumiIacBackendContractDataModel, #IacStateModelContractIacStateModelContractDataModel, #IdJagThreatModelSpikeThreatModelDataModel, #IdJagTokenExchangeContractIdJagTokenExchangeDataModel, #IdentityEventContractIdentityEventContractDataModel, #IdentityOcsfExportContractIdentityOcsfExportDataModel, #IdiomLayerLoweringContractLoweringContractDataModel, #IdiomSemanticsAnnexSemanticsAnnexDataModel, #IfcHandlerTriggerContractIfcHandlerTriggerContractDataModel, #InboundXaaResourceServerContractInboundXaaResourceServerDataModel, #IncidentAggregateContractIncidentAggregateDataModel, #InternalCaPrivateAcmeContractInternalCaPrivateAcmeDataModel, #InternalServiceDiscoveryContractInternalServiceDiscoveryDataModel, #JunctionConnectivityInferenceSpikeJunctionConnectivityInferenceDataModel, #JunctionConnectivityPlanContractJunctionConnectivityPlanDataModel, #JunctionFederatedDomainContractJunctionFederatedDomainDataModel, #JunctionRegistryFederationContractJunctionRegistryFederationDataModel, #JwtSvidIssuanceContractJwtSvidIssuerDataModel, #LaunchSupportEscalationMatrixLaunchSupportEscalationDataModel, #LifecyclePhasePolicyContractLifecyclePhasePolicyDataModel, #ListingLifecycleYankContractListingLifecycleYankDataModel, #LiveEvalsRuntimeContractLiveEvalsRuntimeDataModel, #LiveFixGatedCandidateContractLiveFixGatedCandidateDataModel, #LocalDevTestAuthoringContractLocalDevTestAuthoringDataModel, #MaliciousProviderContainmentContractProviderContainmentContractDataModel, #MatchingEngineSkeletonContractMatchingEngineDataModel, #MatchingSpecificityVectorsMatchingDataModel, #MaterializationSubscriptionContractMaterializationSubscriptionContractDataModel, #McpServerHardeningContractMcpServerHardeningDataModel, #MeteringViewProjectionContractMeteringViewDataModel, #MetricsCatalogPipelineContractMetricsCatalogPipelineDataModel, #MirrorDigestSelectionContractMirrorDigestSelectionDataModel, #MtlsByDefaultConformanceGateMtlsByDefaultConformanceGateDataModel, #MtlsDataPathContractMtlsDataPathDataModel, #MultiCloudShopProviderE2eContractMultiCloudShopGateDataModel, #NativeLogProjectionContractNativeLogProjectionDataModel, #NoEgressGenerationSandboxContractContractDataModel, #NoPrivilegeEscalationPolicyContractNoPrivilegeEscalationPolicyDataModel, #NonIacDriverAdaptersContractNonIacDriverAdaptersDataModel, #ObligationEngineContractObligationEngineDataModel, #ObservabilityCostGuardContractObservabilityCostGuardDataModel, #ObservedContractPromotionContractObservedContractPromotionDataModel, #OciArtifactStorageContractOciArtifactStorageDataModel, #OfflineImportIntegrityContractOfflineImportIntegrityDataModel, #OidcFederationStsContractOidcFederationStsDataModel, #OnCallEscalationContractOnCallEscalationDataModel, #OpenexperimentRuntimeDataContractOpenexperimentRuntimeDataDataModel, #OpenfeatureProviderAdaptersContractOpenfeatureProviderAdaptersDataModel, #OpeninferenceLiveEvalStreamContractOpeninferenceLiveEvalStreamDataModel, #OpeninferenceTrajectoryCaptureContractOpeninferenceTrajectoryCaptureDataModel, #OperationsManifestsContractOperationsManifestsDataModel, #OperatorIntegrationPortsContractOperatorIntegrationPortsDataModel, #OrchestratorChoreographySkeletonContractOrchestratorChoreographyDataModel, #OtelTracesPipelineContractOtelTracesPipelineDataModel, #OutboundXaaTokenExchangeContractOutboundXaaTokenExchangeDataModel, #PaginatedQueryContractPaginatedQueryContractDataModel, #ParadigmIdiomPackagesContractParadigmIdiomPackagesDataModel, #PartialRealizeRollbackContractPartialRealizeRollbackDataModel, #PerAppTenantRoutingContractPerAppTenantRoutingDataModel, #PlannerDagSkeletonContractPlannerDataModel, #PlatformEngineerFlowContractPlatformEngineerFlowDataModel, #PoisonEventQuarantineContractPoisonEventQuarantineDataModel, #PolicyAuditExportContractPolicyAuditExportDataModel, #PolicyAuthoringWaiverContractPolicyAuthoringWaiverDataModel, #PolicyEnginePortContractPolicyEnginePortDataModel, #PolicyEngineProviderAdaptersContractPolicyEngineProviderAdaptersDataModel, #PolicyFailClosedContractPolicyFailClosedDataModel, #PolicyGatedFlagFlipsContractPolicyGatedFlagFlipsDataModel, #PolicyPackFederationContractPolicyPackFederationDataModel, #PolicySupplyChainTrustContractPolicySupplyChainTrustDataModel, #PortabilityReportContractPortabilityReportContractDataModel, #PortabilitySwapEquivalentContractPortabilitySwapEquivalentDataModel, #PreLaunchOutcomeContractPreLaunchOutcomeDataModel, #PreviewEphemeralEnvironmentsContractPreviewEnvironmentsDataModel, #ProjectionConsistencyReactivityContractProjectionContractDataModel, #ProjectionLagConsistencyContractProjectionLagConsistencyDataModel, #ProjectionRebuildContractProjectionRebuildContractDataModel, #ProjectionSinkChangeFeedConformanceContractChangeFeedConformanceDataModel, #ProviderAuthoringContractProviderAuthoringContractDataModel, #ProviderAwsContractProviderAwsDataModel, #ProviderAzureContractProviderAzureDataModel, #ProviderCapabilityConformanceSuitesProviderCapabilityConformanceDataModel, #ProviderCapabilityManifestContractProviderCapabilityManifestDataModel, #ProviderCloudflareContractProviderCloudflareDataModel, #ProviderDefaultDefinitionsContractProviderDefaultDefinitionsDataModel, #ProviderFlyContractProviderFlyContractDataModel, #ProviderGcpContractProviderGcpDataModel, #ProviderHetznerContractProviderHetznerDataModel, #ProviderKubernetesContractProviderKubernetesDataModel, #ProviderLocalZeroInfraProviderLocalDataModel, #ProviderOptionsPatternContractProviderOptionsContractDataModel, #ProviderPortContractProviderPortsDataModel, #ProviderVercelContractProviderVercelDataModel, #QueueClockRuntimePortContractQueueClockRuntimePortDataModel, #RawDriverEscapeHatchContractRawDriverEscapeHatchDataModel, #RbacRoleBindingContractRbacRoleBindingDataModel, #ReactorCoalescingFanoutContractReactorCoalescingFanoutDataModel, #ReactorSkeletonContractReactorSkeletonContractDataModel, #ReadsYourWritesContractReadsYourWritesContractDataModel, #RegionObjectiveRankingContractRegionObjectiveRankingDataModel, #RegistryArtifactDescriptorContractRegistryDescriptorDataModel, #RegistryCompromiseGuardContractRegistryCompromiseGuardDataModel, #RegistryDependencyConfusionGuardContractRegistryDependencyConfusionGuardDataModel, #RegistryImportContractRegistryImportDataModel, #RegistryPublishFlowContractRegistryPublishFlowDataModel, #RelationalProjectionSinkContractRelationalProjectionSinkDataModel, #ReliabilitySlaRollupContractReliabilitySlaRollupDataModel, #RemediationSafetyGateContractRemediationSafetyGateDataModel, #ReplayLiveEquivalencePocEquivalenceDataModel, #RepoViewEscapeHatchesContractRepoViewEscapeHatchesDataModel, #ResourceCollectionEngineContractResourceCollectionEngineDataModel, #ResourceDefinitionDriverContractResourceDefinitionDriverContractDataModel, #ResourcePackDistributionContractResourcePackDistributionDataModel, #ResourceactorFsmContractResourceactorFsmContractDataModel, #ResourceactorReconcileLoopContractResourceactorReconcileLoopDataModel, #RollbackFailureCompensationContractRollbackFailureCompensationDataModel, #RunInspectorProjectionContractRunInspectorDataModel, #RunawayRemediationGuardContractRunawayRemediationGuardDataModel, #RunawaySpendCircuitBreakerContractRunawaySpendCircuitBreakerDataModel, #RunbookContractRunbookContractDataModel, #RunbookExecutionEngineContractRunbookExecutionEngineDataModel, #RuntimeLocalComponentHostComponentHostDataModel, #RuntimeLocalExecutionLimitsContractExecutionLimitsDataModel, #RuntimePortConformanceContractRuntimePortConformanceDataModel, #SagaCompensationEngineContractSagaCompensationEngineDataModel, #SagaCreditReconciliationSpikeSpikeDataModel, #SdkCodegenSurfaceContractSdkCodegenSurfaceDataModel, #SdkFlagSurfaceContractSdkFlagSurfaceDataModel, #SdkIdiomConformanceGateSdkConformanceGateDataModel, #SearchExtensionPackagesContractSearchExtensionPackagesDataModel, #SecopsPolicyAuditJourneyContractSecopsPolicyAuditJourneyDataModel, #SecretZeroGenesisBootstrapContractGenesisBootstrapTrustDataModel, #SecretlessConfigResolutionContractSecretlessConfigResolutionDataModel, #SelfHostBootstrapOrderingSpikeBootstrapOrderingDataModel, #SelfHostBootstrapSagaContractSelfHostBootstrapSagaDataModel, #SessionRevocationContractSessionRevocationDataModel, #SharedCostAttributionContractSharedCostAttributionDataModel, #ShowbackAttributionContractShowbackAttributionDataModel, #SignedArtifactPublishInstallContractPublishInstallContractDataModel, #SignedOfflineBundleContractBundleContractDataModel, #SloAsCodeContractSloContractDataModel, #SloComputationEngineContractSloComputationEngineDataModel, #SloGamingGuardContractSloGamingGuardContractDataModel, #SloGatedRollbackAnalysisContractSloGatedRollbackAnalysisDataModel, #SloPromotionGateContractSloPromotionGateContractDataModel, #SloRollbackDecisionCorrectnessSpikeReplayCorpusDataModel, #SlsaProvenanceCertificationContractProvenanceDataModel, #SnapshotCompactionContractSnapshotCompactionContractDataModel, #SnapshotReplayDivergenceContractSnapshotReplayDivergenceContractDataModel, #SplitHorizonPartitionConnectivityContractSplitHorizonPartitionConnectivityDataModel, #SreDecisionTreeContractSreDecisionTreeDataModel, #SreDiagnoseProjectionContractSreDiagnoseProjectionDataModel, #SreDriftRemediationJourneyContractSreDriftRemediationJourneyDataModel, #SreMttdMttrPostmortemContractSreMttdMttrPostmortemDataModel, #SreOperatorSkeletonContractSreOperatorSkeletonDataModel, #StaticKeyEscapeHatchContractStaticKeyEscapeHatchDataModel, #StreamerRuntimePortContractStreamerRuntimePortDataModel, #StructuredLogPipelineContractStructuredLogPipelineDataModel, #StuckRolloutConvergenceContractStuckRolloutConvergenceDataModel, #SvidAutoRotationContractSvidRotationDataModel, #SvidCrossTenantGuardContractSvidCrossTenantGuardDataModel, #SvidPartitionGraceSpikePartitionGraceDataModel, #SystemFailureClassifierContractClassifierDataModel, #TelemetryEnvelopeContractTelemetryEnvelopeContractDataModel, #TenantDataLifecycleContractTenantDataLifecycleDataModel, #TierFivePublicMtlsContractTierFivePublicMtlsDataModel, #TierFourOverlayMeshContractTierFourOverlayMeshDataModel, #TierOnePrivateNetworkContractTierOnePrivateNetworkDataModel, #TierThreePrivateInterconnectContractTierThreePrivateInterconnectDataModel, #TierTwoCrossRegionNetworkContractTierTwoCrossRegionNetworkDataModel, #TokenBrokerHaCacheContractTokenBrokerHaCacheDataModel, #TokenBrokerSkeletonContractTokenBrokerSkeletonDataModel, #TokenReplayResistanceContractTokenReplayResistanceDataModel, #TopologyObjectsContractTopologyObjectsDataModel, #TopologyOverrideConflictContractTopologyOverrideConflictDataModel, #TraceContextPropagationContractTraceContextPropagationDataModel, #TrainingDataPoisoningGuardContractTrainingDataPoisoningGuardDataModel, #TrainingEnginePortContractTrainingEngineContractDataModel, #TrustTierPolicyContractTrustTierPolicyDataModel, #UsageInferredPermissionsContractUsagePermissionsDataModel, #V1CutlineContractV1CutlineDataModel, #V1ReleaseNotesUpgradeGuideContractReleaseNotesUpgradeGuideDataModel, #VersionCompatResolutionSemanticsResolutionSemanticsDataModel, #VersionPinningDriftGuardContractVersionPinningDriftGuardDataModel, #VmMicrovmBuildProvidersContractVmMicrovmBuildProvidersDataModel, #VscodeExtensionContractVscodeExtensionContractDataModel, #WasiInterfacePinsWasiPinsDataModel, #WebsocketPreviewWitContractWebsocketPreviewContractDataModel, #WebsocketStreamerFanoutContractWebsocketStreamerFanoutDataModel, #WireVersionNegotiationContractWireVersionNegotiationDataModel, #WorkloadAttestationIntakeContractWorkloadAttestationDataModel, #WrpcDeadlinePropagationContractWrpcDeadlinePropagationDataModel, #WrpcInProcessLinkContractWrpcInProcessLinkDataModel, #WrpcLatticeTransportContractWrpcLatticeTransportDataModel, #WrpcMembraneFailureContractWrpcMembraneFailureDataModel, #X509SvidMtlsContractX509SvidMtlsDataModel, #XaaConfusedDeputyGuardContractXaaConfusedDeputyGuardDataModel, #YardDomainValidationContractYardDomainValidationDataModel, #YardIdentityIssuerContractIssuerDataModel, #YardTopologyManifestContractYardTopologyManifestDataModel]
}

catalog: #Catalog & {
	entries: [
	{
		contractId:       "hobo.datamodel.acme-dns01-cert-issuance-contract.acme-dns01-cert-issuance"
		protobufMessage:  "AcmeDns01CertIssuanceContractAcmeDns01CertIssuanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AcmeDns01CertIssuanceContractAcmeDns01CertIssuanceDataModel"
		sourcePath:       "src/draft/acme-dns01-cert-issuance-contract/src/acme-dns01-cert-issuance.ts"
		packageName:      "acme-dns01-cert-issuance-contract"
		domain:           "acme-dns01-cert-issuance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.actor-host-runtime-port-contract.actor-host-runtime-port"
		protobufMessage:  "ActorHostRuntimePortContractActorHostRuntimePortDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ActorHostRuntimePortContractActorHostRuntimePortDataModel"
		sourcePath:       "src/draft/actor-host-runtime-port-contract/src/actor-host-runtime-port.ts"
		packageName:      "actor-host-runtime-port-contract"
		domain:           "actor-host-runtime-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.adopt-in-place-contract.adopt-in-place-contract"
		protobufMessage:  "AdoptInPlaceContractAdoptInPlaceContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AdoptInPlaceContractAdoptInPlaceContractDataModel"
		sourcePath:       "src/draft/adopt-in-place-contract/src/adopt-in-place-contract.ts"
		packageName:      "adopt-in-place-contract"
		domain:           "adopt-in-place"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.alertmanager-routing-contract.alertmanager-routing"
		protobufMessage:  "AlertmanagerRoutingContractAlertmanagerRoutingDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AlertmanagerRoutingContractAlertmanagerRoutingDataModel"
		sourcePath:       "src/draft/alertmanager-routing-contract/src/alertmanager-routing.ts"
		packageName:      "alertmanager-routing-contract"
		domain:           "alertmanager-routing"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.anonymous-preview-path-contract.anonymous-preview-path"
		protobufMessage:  "AnonymousPreviewPathContractAnonymousPreviewPathDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AnonymousPreviewPathContractAnonymousPreviewPathDataModel"
		sourcePath:       "src/draft/anonymous-preview-path-contract/src/anonymous-preview-path.ts"
		packageName:      "anonymous-preview-path-contract"
		domain:           "anonymous-preview-path"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.app-dev-journey-contract.app-dev-journey"
		protobufMessage:  "AppDevJourneyContractAppDevJourneyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AppDevJourneyContractAppDevJourneyDataModel"
		sourcePath:       "src/draft/app-dev-journey-contract/src/app-dev-journey.ts"
		packageName:      "app-dev-journey-contract"
		domain:           "app-dev-journey"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.artifact-repo-port-contract.artifact-repo-port"
		protobufMessage:  "ArtifactRepoPortContractArtifactRepoPortDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ArtifactRepoPortContractArtifactRepoPortDataModel"
		sourcePath:       "src/draft/artifact-repo-port-contract/src/artifact-repo-port.ts"
		packageName:      "artifact-repo-port-contract"
		domain:           "artifact-repo-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.auth-flag-readset-contract.auth-flag-readset"
		protobufMessage:  "AuthFlagReadsetContractAuthFlagReadsetDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AuthFlagReadsetContractAuthFlagReadsetDataModel"
		sourcePath:       "src/draft/auth-flag-readset-contract/src/auth-flag-readset.ts"
		packageName:      "auth-flag-readset-contract"
		domain:           "auth-flag-readset"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.auth-port-rbac-resolution-contract.auth-port-rbac-resolution"
		protobufMessage:  "AuthPortRbacResolutionContractAuthPortRbacResolutionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AuthPortRbacResolutionContractAuthPortRbacResolutionDataModel"
		sourcePath:       "src/draft/auth-port-rbac-resolution-contract/src/auth-port-rbac-resolution.ts"
		packageName:      "auth-port-rbac-resolution-contract"
		domain:           "auth-port-rbac-resolution"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.author-time-capability-feedback-contract.author-time-capability-feedback"
		protobufMessage:  "AuthorTimeCapabilityFeedbackContractAuthorTimeCapabilityFeedbackDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AuthorTimeCapabilityFeedbackContractAuthorTimeCapabilityFeedbackDataModel"
		sourcePath:       "src/draft/author-time-capability-feedback-contract/src/author-time-capability-feedback.ts"
		packageName:      "author-time-capability-feedback-contract"
		domain:           "author-time-capability-feedback"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.autonomous-drift-remediation-contract.autonomous-drift-remediation"
		protobufMessage:  "AutonomousDriftRemediationContractAutonomousDriftRemediationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AutonomousDriftRemediationContractAutonomousDriftRemediationDataModel"
		sourcePath:       "src/draft/autonomous-drift-remediation-contract/src/autonomous-drift-remediation.ts"
		packageName:      "autonomous-drift-remediation-contract"
		domain:           "autonomous-drift-remediation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.availability-view-contract.availability-view"
		protobufMessage:  "AvailabilityViewContractAvailabilityViewDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#AvailabilityViewContractAvailabilityViewDataModel"
		sourcePath:       "src/draft/availability-view-contract/src/availability-view.ts"
		packageName:      "availability-view-contract"
		domain:           "availability-view"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.billing-launch-policy-contract.billing-launch-policy"
		protobufMessage:  "BillingLaunchPolicyContractBillingLaunchPolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#BillingLaunchPolicyContractBillingLaunchPolicyDataModel"
		sourcePath:       "src/draft/billing-launch-policy-contract/src/billing-launch-policy.ts"
		packageName:      "billing-launch-policy-contract"
		domain:           "billing-launch-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.bind-reference-wiring-contract.bind-reference-contract"
		protobufMessage:  "BindReferenceWiringContractBindReferenceContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#BindReferenceWiringContractBindReferenceContractDataModel"
		sourcePath:       "src/draft/bind-reference-wiring-contract/src/bind-reference-contract.ts"
		packageName:      "bind-reference-wiring-contract"
		domain:           "bind-reference-wiring"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.budget-quota-policy-contract.budget-quota-policy"
		protobufMessage:  "BudgetQuotaPolicyContractBudgetQuotaPolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#BudgetQuotaPolicyContractBudgetQuotaPolicyDataModel"
		sourcePath:       "src/draft/budget-quota-policy-contract/src/budget-quota-policy.ts"
		packageName:      "budget-quota-policy-contract"
		domain:           "budget-quota-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.build-dagger-provider-contract.build-dagger-provider"
		protobufMessage:  "BuildDaggerProviderContractBuildDaggerProviderDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#BuildDaggerProviderContractBuildDaggerProviderDataModel"
		sourcePath:       "src/draft/build-dagger-provider-contract/src/build-dagger-provider.ts"
		packageName:      "build-dagger-provider-contract"
		domain:           "build-dagger-provider"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.build-wasm-provider-contract.build-wasm-provider"
		protobufMessage:  "BuildWasmProviderContractBuildWasmProviderDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#BuildWasmProviderContractBuildWasmProviderDataModel"
		sourcePath:       "src/draft/build-wasm-provider-contract/src/build-wasm-provider.ts"
		packageName:      "build-wasm-provider-contract"
		domain:           "build-wasm-provider"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.built-in-flag-store-contract.built-in-flag-store"
		protobufMessage:  "BuiltInFlagStoreContractBuiltInFlagStoreDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#BuiltInFlagStoreContractBuiltInFlagStoreDataModel"
		sourcePath:       "src/draft/built-in-flag-store-contract/src/built-in-flag-store.ts"
		packageName:      "built-in-flag-store-contract"
		domain:           "built-in-flag-store"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.built-in-opto-training-engine-contract.built-in-opto-training-engine"
		protobufMessage:  "BuiltInOptoTrainingEngineContractBuiltInOptoTrainingEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#BuiltInOptoTrainingEngineContractBuiltInOptoTrainingEngineDataModel"
		sourcePath:       "src/draft/built-in-opto-training-engine-contract/src/built-in-opto-training-engine.ts"
		packageName:      "built-in-opto-training-engine-contract"
		domain:           "built-in-opto-training-engine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.built-in-policy-engine-contract.built-in-policy-engine"
		protobufMessage:  "BuiltInPolicyEngineContractBuiltInPolicyEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#BuiltInPolicyEngineContractBuiltInPolicyEngineDataModel"
		sourcePath:       "src/draft/built-in-policy-engine-contract/src/built-in-policy-engine.ts"
		packageName:      "built-in-policy-engine-contract"
		domain:           "built-in-policy-engine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.camp-eventstore-runtime-port-contract.camp-eventstore-runtime-port"
		protobufMessage:  "CampEventstoreRuntimePortContractCampEventstoreRuntimePortDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CampEventstoreRuntimePortContractCampEventstoreRuntimePortDataModel"
		sourcePath:       "src/draft/camp-eventstore-runtime-port-contract/src/camp-eventstore-runtime-port.ts"
		packageName:      "camp-eventstore-runtime-port-contract"
		domain:           "camp-eventstore-runtime-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.camp-mapping-sugar-compiler.camp-mapping-sugar-compiler"
		protobufMessage:  "CampMappingSugarCompilerCampMappingSugarCompilerDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CampMappingSugarCompilerCampMappingSugarCompilerDataModel"
		sourcePath:       "src/draft/camp-mapping-sugar-compiler/src/camp-mapping-sugar-compiler.ts"
		packageName:      "camp-mapping-sugar-compiler"
		domain:           "camp-mapping-sugar-compiler"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.can-deploy-compatibility-gate-contract.compatibility-gate"
		protobufMessage:  "CanDeployCompatibilityGateContractCompatibilityGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CanDeployCompatibilityGateContractCompatibilityGateDataModel"
		sourcePath:       "src/draft/can-deploy-compatibility-gate-contract/src/compatibility-gate.ts"
		packageName:      "can-deploy-compatibility-gate-contract"
		domain:           "can-deploy-compatibility-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.capability-enforcement-contract.capability-enforcement"
		protobufMessage:  "CapabilityEnforcementContractCapabilityEnforcementDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CapabilityEnforcementContractCapabilityEnforcementDataModel"
		sourcePath:       "src/draft/capability-enforcement-contract/src/capability-enforcement.ts"
		packageName:      "capability-enforcement-contract"
		domain:           "capability-enforcement"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.capability-indexed-discovery-contract.capability-indexed-discovery"
		protobufMessage:  "CapabilityIndexedDiscoveryContractCapabilityIndexedDiscoveryDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CapabilityIndexedDiscoveryContractCapabilityIndexedDiscoveryDataModel"
		sourcePath:       "src/draft/capability-indexed-discovery-contract/src/capability-indexed-discovery.ts"
		packageName:      "capability-indexed-discovery-contract"
		domain:           "capability-indexed-discovery"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.capability-negotiation-contract.capability-negotiation"
		protobufMessage:  "CapabilityNegotiationContractCapabilityNegotiationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CapabilityNegotiationContractCapabilityNegotiationDataModel"
		sourcePath:       "src/draft/capability-negotiation-contract/src/capability-negotiation.ts"
		packageName:      "capability-negotiation-contract"
		domain:           "capability-negotiation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.capability-spec-contract.capability-spec"
		protobufMessage:  "CapabilitySpecContractCapabilitySpecDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CapabilitySpecContractCapabilitySpecDataModel"
		sourcePath:       "src/draft/capability-spec-contract/src/capability-spec.ts"
		packageName:      "capability-spec-contract"
		domain:           "capability-spec"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.champion-challenger-promotion-contract.champion-challenger-promotion"
		protobufMessage:  "ChampionChallengerPromotionContractChampionChallengerPromotionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ChampionChallengerPromotionContractChampionChallengerPromotionDataModel"
		sourcePath:       "src/draft/champion-challenger-promotion-contract/src/champion-challenger-promotion.ts"
		packageName:      "champion-challenger-promotion-contract"
		domain:           "champion-challenger-promotion"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.chaos-experiment-orchestration-contract.chaos-experiment-orchestration"
		protobufMessage:  "ChaosExperimentOrchestrationContractChaosExperimentOrchestrationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ChaosExperimentOrchestrationContractChaosExperimentOrchestrationDataModel"
		sourcePath:       "src/draft/chaos-experiment-orchestration-contract/src/chaos-experiment-orchestration.ts"
		packageName:      "chaos-experiment-orchestration-contract"
		domain:           "chaos-experiment-orchestration"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.choreographed-compensation-contract.choreographed-compensation"
		protobufMessage:  "ChoreographedCompensationContractChoreographedCompensationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ChoreographedCompensationContractChoreographedCompensationDataModel"
		sourcePath:       "src/draft/choreographed-compensation-contract/src/choreographed-compensation.ts"
		packageName:      "choreographed-compensation-contract"
		domain:           "choreographed-compensation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.choreography-saga-engine-contract.choreography-saga-engine"
		protobufMessage:  "ChoreographySagaEngineContractChoreographySagaEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ChoreographySagaEngineContractChoreographySagaEngineDataModel"
		sourcePath:       "src/draft/choreography-saga-engine-contract/src/choreography-saga-engine.ts"
		packageName:      "choreography-saga-engine-contract"
		domain:           "choreography-saga-engine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.ci-fabric-oidc-e2e-contract.ci-fabric-contract"
		protobufMessage:  "CiFabricOidcE2eContractCiFabricContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CiFabricOidcE2eContractCiFabricContractDataModel"
		sourcePath:       "src/draft/ci-fabric-oidc-e2e-contract/src/ci-fabric-contract.ts"
		packageName:      "ci-fabric-oidc-e2e-contract"
		domain:           "ci-fabric-oidc-e2e"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cli-credential-hardening-contract.cli-credential-hardening"
		protobufMessage:  "CliCredentialHardeningContractCliCredentialHardeningDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CliCredentialHardeningContractCliCredentialHardeningDataModel"
		sourcePath:       "src/draft/cli-credential-hardening-contract/src/cli-credential-hardening.ts"
		packageName:      "cli-credential-hardening-contract"
		domain:           "cli-credential-hardening"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.client-optimistic-update-contract.client-optimistic-update-contract"
		protobufMessage:  "ClientOptimisticUpdateContractClientOptimisticUpdateContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ClientOptimisticUpdateContractClientOptimisticUpdateContractDataModel"
		sourcePath:       "src/draft/client-optimistic-update-contract/src/client-optimistic-update-contract.ts"
		packageName:      "client-optimistic-update-contract"
		domain:           "client-optimistic-update"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.closure-builder-public-api-contract.closure-builder-public-api"
		protobufMessage:  "ClosureBuilderPublicApiContractClosureBuilderPublicApiDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ClosureBuilderPublicApiContractClosureBuilderPublicApiDataModel"
		sourcePath:       "src/draft/closure-builder-public-api-contract/src/closure-builder-public-api.ts"
		packageName:      "closure-builder-public-api-contract"
		domain:           "closure-builder-public-api"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.collection-coverage-gate-contract.collection-coverage-gate"
		protobufMessage:  "CollectionCoverageGateContractCollectionCoverageGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CollectionCoverageGateContractCollectionCoverageGateDataModel"
		sourcePath:       "src/draft/collection-coverage-gate-contract/src/collection-coverage-gate.ts"
		packageName:      "collection-coverage-gate-contract"
		domain:           "collection-coverage-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.compensation-escalation-contract.compensation-escalation"
		protobufMessage:  "CompensationEscalationContractCompensationEscalationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CompensationEscalationContractCompensationEscalationDataModel"
		sourcePath:       "src/draft/compensation-escalation-contract/src/compensation-escalation.ts"
		packageName:      "compensation-escalation-contract"
		domain:           "compensation-escalation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.component-host-adapter-certification-spike.component-host-adapter-certification"
		protobufMessage:  "ComponentHostAdapterCertificationSpikeComponentHostAdapterCertificationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ComponentHostAdapterCertificationSpikeComponentHostAdapterCertificationDataModel"
		sourcePath:       "src/draft/component-host-adapter-certification-spike/src/component-host-adapter-certification.ts"
		packageName:      "component-host-adapter-certification-spike"
		domain:           "component-host-adapter-certification"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.component-host-conformance-suite.component-host-conformance"
		protobufMessage:  "ComponentHostConformanceSuiteComponentHostConformanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ComponentHostConformanceSuiteComponentHostConformanceDataModel"
		sourcePath:       "src/draft/component-host-conformance-suite/src/component-host-conformance.ts"
		packageName:      "component-host-conformance-suite"
		domain:           "component-host-conformance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.component-host-oci-floor-contract.component-host-oci-floor"
		protobufMessage:  "ComponentHostOciFloorContractComponentHostOciFloorDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ComponentHostOciFloorContractComponentHostOciFloorDataModel"
		sourcePath:       "src/draft/component-host-oci-floor-contract/src/component-host-oci-floor.ts"
		packageName:      "component-host-oci-floor-contract"
		domain:           "component-host-oci-floor"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.conformance-port-suite-contract.conformance-port-suite"
		protobufMessage:  "ConformancePortSuiteContractConformancePortSuiteDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ConformancePortSuiteContractConformancePortSuiteDataModel"
		sourcePath:       "src/draft/conformance-port-suite-contract/src/conformance-port-suite.ts"
		packageName:      "conformance-port-suite-contract"
		domain:           "conformance-port-suite"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.connectivity-cost-feedback-contract.connectivity-cost-feedback"
		protobufMessage:  "ConnectivityCostFeedbackContractConnectivityCostFeedbackDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ConnectivityCostFeedbackContractConnectivityCostFeedbackDataModel"
		sourcePath:       "src/draft/connectivity-cost-feedback-contract/src/connectivity-cost-feedback.ts"
		packageName:      "connectivity-cost-feedback-contract"
		domain:           "connectivity-cost-feedback"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.connectivity-policy-enforcement-contract.connectivity-policy-enforcement"
		protobufMessage:  "ConnectivityPolicyEnforcementContractConnectivityPolicyEnforcementDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ConnectivityPolicyEnforcementContractConnectivityPolicyEnforcementDataModel"
		sourcePath:       "src/draft/connectivity-policy-enforcement-contract/src/connectivity-policy-enforcement.ts"
		packageName:      "connectivity-policy-enforcement-contract"
		domain:           "connectivity-policy-enforcement"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.connectivity-tier-ir-contract.connectivity-tier-ir"
		protobufMessage:  "ConnectivityTierIrContractConnectivityTierIrDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ConnectivityTierIrContractConnectivityTierIrDataModel"
		sourcePath:       "src/draft/connectivity-tier-ir-contract/src/connectivity-tier-ir.ts"
		packageName:      "connectivity-tier-ir-contract"
		domain:           "connectivity-tier-ir"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.contract-engine-port-contract.contract-engine"
		protobufMessage:  "ContractEnginePortContractContractEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ContractEnginePortContractContractEngineDataModel"
		sourcePath:       "src/draft/contract-engine-port-contract/src/contract-engine.ts"
		packageName:      "contract-engine-port-contract"
		domain:           "contract-engine-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.control-plane-action-taxonomy-contract.control-plane-action-taxonomy"
		protobufMessage:  "ControlPlaneActionTaxonomyContractControlPlaneActionTaxonomyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ControlPlaneActionTaxonomyContractControlPlaneActionTaxonomyDataModel"
		sourcePath:       "src/draft/control-plane-action-taxonomy-contract/src/control-plane-action-taxonomy.ts"
		packageName:      "control-plane-action-taxonomy-contract"
		domain:           "control-plane-action-taxonomy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.control-plane-authz-cache-contract.control-plane-authz-cache"
		protobufMessage:  "ControlPlaneAuthzCacheContractControlPlaneAuthzCacheDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ControlPlaneAuthzCacheContractControlPlaneAuthzCacheDataModel"
		sourcePath:       "src/draft/control-plane-authz-cache-contract/src/control-plane-authz-cache.ts"
		packageName:      "control-plane-authz-cache-contract"
		domain:           "control-plane-authz-cache"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.control-plane-event-schema-contract.control-plane-events"
		protobufMessage:  "ControlPlaneEventSchemaContractControlPlaneEventsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ControlPlaneEventSchemaContractControlPlaneEventsDataModel"
		sourcePath:       "src/draft/control-plane-event-schema-contract/src/control-plane-events.ts"
		packageName:      "control-plane-event-schema-contract"
		domain:           "control-plane-event-schema"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.control-plane-policy-bypass-guard.control-plane-policy-bypass-guard"
		protobufMessage:  "ControlPlanePolicyBypassGuardControlPlanePolicyBypassGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ControlPlanePolicyBypassGuardControlPlanePolicyBypassGuardDataModel"
		sourcePath:       "src/draft/control-plane-policy-bypass-guard/src/control-plane-policy-bypass-guard.ts"
		packageName:      "control-plane-policy-bypass-guard"
		domain:           "control-plane-policy-bypass-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cost-degradation-saga-contract.cost-degradation-saga"
		protobufMessage:  "CostDegradationSagaContractCostDegradationSagaDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CostDegradationSagaContractCostDegradationSagaDataModel"
		sourcePath:       "src/draft/cost-degradation-saga-contract/src/cost-degradation-saga.ts"
		packageName:      "cost-degradation-saga-contract"
		domain:           "cost-degradation-saga"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cost-routing-eligibility-contract.cost-routing-eligibility"
		protobufMessage:  "CostRoutingEligibilityContractCostRoutingEligibilityDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CostRoutingEligibilityContractCostRoutingEligibilityDataModel"
		sourcePath:       "src/draft/cost-routing-eligibility-contract/src/cost-routing-eligibility.ts"
		packageName:      "cost-routing-eligibility-contract"
		domain:           "cost-routing-eligibility"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cost-signal-contract.cost-signal-contract"
		protobufMessage:  "CostSignalContractCostSignalContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CostSignalContractCostSignalContractDataModel"
		sourcePath:       "src/draft/cost-signal-contract/src/cost-signal-contract.ts"
		packageName:      "cost-signal-contract"
		domain:           "cost-signal"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cqrs-command-aggregate-contract.cqrs-command-aggregate-contract"
		protobufMessage:  "CqrsCommandAggregateContractCqrsCommandAggregateContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CqrsCommandAggregateContractCqrsCommandAggregateContractDataModel"
		sourcePath:       "src/draft/cqrs-command-aggregate-contract/src/cqrs-command-aggregate-contract.ts"
		packageName:      "cqrs-command-aggregate-contract"
		domain:           "cqrs-command-aggregate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.credit-ledger-view-contract.credit-ledger-view"
		protobufMessage:  "CreditLedgerViewContractCreditLedgerViewDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CreditLedgerViewContractCreditLedgerViewDataModel"
		sourcePath:       "src/draft/credit-ledger-view-contract/src/credit-ledger-view.ts"
		packageName:      "credit-ledger-view-contract"
		domain:           "credit-ledger-view"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.crew-event-contract.crew-event-contract"
		protobufMessage:  "CrewEventContractCrewEventContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CrewEventContractCrewEventContractDataModel"
		sourcePath:       "src/draft/crew-event-contract/src/crew-event-contract.ts"
		packageName:      "crew-event-contract"
		domain:           "crew-event"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cross-camp-bounded-staleness-contract.cross-camp-bounded-staleness"
		protobufMessage:  "CrossCampBoundedStalenessContractCrossCampBoundedStalenessDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CrossCampBoundedStalenessContractCrossCampBoundedStalenessDataModel"
		sourcePath:       "src/draft/cross-camp-bounded-staleness-contract/src/cross-camp-bounded-staleness.ts"
		packageName:      "cross-camp-bounded-staleness-contract"
		domain:           "cross-camp-bounded-staleness"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cross-camp-flag-state-consistency-contract.cross-camp-flag-state-consistency"
		protobufMessage:  "CrossCampFlagStateConsistencyContractCrossCampFlagStateConsistencyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CrossCampFlagStateConsistencyContractCrossCampFlagStateConsistencyDataModel"
		sourcePath:       "src/draft/cross-camp-flag-state-consistency-contract/src/cross-camp-flag-state-consistency.ts"
		packageName:      "cross-camp-flag-state-consistency-contract"
		domain:           "cross-camp-flag-state-consistency"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cross-camp-routing-policy-contract.cross-camp-routing-policy"
		protobufMessage:  "CrossCampRoutingPolicyContractCrossCampRoutingPolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CrossCampRoutingPolicyContractCrossCampRoutingPolicyDataModel"
		sourcePath:       "src/draft/cross-camp-routing-policy-contract/src/cross-camp-routing-policy.ts"
		packageName:      "cross-camp-routing-policy-contract"
		domain:           "cross-camp-routing-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cross-cloud-equivalence-model.resolver"
		protobufMessage:  "CrossCloudEquivalenceModelResolverDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CrossCloudEquivalenceModelResolverDataModel"
		sourcePath:       "src/draft/cross-cloud-equivalence-model/src/resolver.ts"
		packageName:      "cross-cloud-equivalence-model"
		domain:           "cross-cloud-equivalence-model"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cross-layer-generated-stack-propagation-contract.cross-layer-generated-stack-propagation"
		protobufMessage:  "CrossLayerGeneratedStackPropagationContractCrossLayerGeneratedStackPropagationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CrossLayerGeneratedStackPropagationContractCrossLayerGeneratedStackPropagationDataModel"
		sourcePath:       "src/draft/cross-layer-generated-stack-propagation-contract/src/cross-layer-generated-stack-propagation.ts"
		packageName:      "cross-layer-generated-stack-propagation-contract"
		domain:           "cross-layer-generated-stack-propagation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.cross-yard-policy-attestation-contract.cross-yard-policy-attestation"
		protobufMessage:  "CrossYardPolicyAttestationContractCrossYardPolicyAttestationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CrossYardPolicyAttestationContractCrossYardPolicyAttestationDataModel"
		sourcePath:       "src/draft/cross-yard-policy-attestation-contract/src/cross-yard-policy-attestation.ts"
		packageName:      "cross-yard-policy-attestation-contract"
		domain:           "cross-yard-policy-attestation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.crypto-shred-erasure-contract.crypto-shred-erasure-contract"
		protobufMessage:  "CryptoShredErasureContractCryptoShredErasureContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CryptoShredErasureContractCryptoShredErasureContractDataModel"
		sourcePath:       "src/draft/crypto-shred-erasure-contract/src/crypto-shred-erasure-contract.ts"
		packageName:      "crypto-shred-erasure-contract"
		domain:           "crypto-shred-erasure"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.curated-catalog-policy-contract.curated-catalog-policy"
		protobufMessage:  "CuratedCatalogPolicyContractCuratedCatalogPolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#CuratedCatalogPolicyContractCuratedCatalogPolicyDataModel"
		sourcePath:       "src/draft/curated-catalog-policy-contract/src/curated-catalog-policy.ts"
		packageName:      "curated-catalog-policy-contract"
		domain:           "curated-catalog-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.data-flywheel-privacy-spike.privacy-model"
		protobufMessage:  "DataFlywheelPrivacySpikePrivacyModelDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DataFlywheelPrivacySpikePrivacyModelDataModel"
		sourcePath:       "src/draft/data-flywheel-privacy-spike/src/privacy-model.ts"
		packageName:      "data-flywheel-privacy-spike"
		domain:           "data-flywheel-privacy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.data-governance-policy-contract.data-governance-policy"
		protobufMessage:  "DataGovernancePolicyContractDataGovernancePolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DataGovernancePolicyContractDataGovernancePolicyDataModel"
		sourcePath:       "src/draft/data-governance-policy-contract/src/data-governance-policy.ts"
		packageName:      "data-governance-policy-contract"
		domain:           "data-governance-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.data-paradigm-authoring-contract.data-paradigm-authoring"
		protobufMessage:  "DataParadigmAuthoringContractDataParadigmAuthoringDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DataParadigmAuthoringContractDataParadigmAuthoringDataModel"
		sourcePath:       "src/draft/data-paradigm-authoring-contract/src/data-paradigm-authoring.ts"
		packageName:      "data-paradigm-authoring-contract"
		domain:           "data-paradigm-authoring"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.default-read-surface-contract.default-read-surface"
		protobufMessage:  "DefaultReadSurfaceContractDefaultReadSurfaceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DefaultReadSurfaceContractDefaultReadSurfaceDataModel"
		sourcePath:       "src/draft/default-read-surface-contract/src/default-read-surface.ts"
		packageName:      "default-read-surface-contract"
		domain:           "default-read-surface"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.default-role-action-matrix-contract.default-role-action-matrix"
		protobufMessage:  "DefaultRoleActionMatrixContractDefaultRoleActionMatrixDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DefaultRoleActionMatrixContractDefaultRoleActionMatrixDataModel"
		sourcePath:       "src/draft/default-role-action-matrix-contract/src/default-role-action-matrix.ts"
		packageName:      "default-role-action-matrix-contract"
		domain:           "default-role-action-matrix"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.delivery-experiment-adapter-conformance-suite.harness-adapter-conformance"
		protobufMessage:  "DeliveryExperimentAdapterConformanceSuiteHarnessAdapterConformanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DeliveryExperimentAdapterConformanceSuiteHarnessAdapterConformanceDataModel"
		sourcePath:       "src/draft/delivery-experiment-adapter-conformance-suite/src/harness-adapter-conformance.ts"
		packageName:      "delivery-experiment-adapter-conformance-suite"
		domain:           "delivery-experiment-adapter-conformance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.delivery-orchestrator-skeleton-contract.delivery-orchestrator"
		protobufMessage:  "DeliveryOrchestratorSkeletonContractDeliveryOrchestratorDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DeliveryOrchestratorSkeletonContractDeliveryOrchestratorDataModel"
		sourcePath:       "src/draft/delivery-orchestrator-skeleton-contract/src/delivery-orchestrator.ts"
		packageName:      "delivery-orchestrator-skeleton-contract"
		domain:           "delivery-orchestrator-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.delta-set-apply-reconcile-contract.delta-set-apply-reconcile"
		protobufMessage:  "DeltaSetApplyReconcileContractDeltaSetApplyReconcileDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DeltaSetApplyReconcileContractDeltaSetApplyReconcileDataModel"
		sourcePath:       "src/draft/delta-set-apply-reconcile-contract/src/delta-set-apply-reconcile.ts"
		packageName:      "delta-set-apply-reconcile-contract"
		domain:           "delta-set-apply-reconcile"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.deny-ceiling-algebra-poc.deny-ceiling-algebra"
		protobufMessage:  "DenyCeilingAlgebraPocDenyCeilingAlgebraDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DenyCeilingAlgebraPocDenyCeilingAlgebraDataModel"
		sourcePath:       "src/draft/deny-ceiling-algebra-poc/src/deny-ceiling-algebra.ts"
		packageName:      "deny-ceiling-algebra-poc"
		domain:           "deny-ceiling-algebra"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.deployment-plan-ir-contract.deployment-plan-ir"
		protobufMessage:  "DeploymentPlanIrContractDeploymentPlanIrDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DeploymentPlanIrContractDeploymentPlanIrDataModel"
		sourcePath:       "src/draft/deployment-plan-ir-contract/src/deployment-plan-ir.ts"
		packageName:      "deployment-plan-ir-contract"
		domain:           "deployment-plan-ir"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.deployment-strategy-saga-templates-contract.deployment-strategy-saga-templates"
		protobufMessage:  "DeploymentStrategySagaTemplatesContractDeploymentStrategySagaTemplatesDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DeploymentStrategySagaTemplatesContractDeploymentStrategySagaTemplatesDataModel"
		sourcePath:       "src/draft/deployment-strategy-saga-templates-contract/src/deployment-strategy-saga-templates.ts"
		packageName:      "deployment-strategy-saga-templates-contract"
		domain:           "deployment-strategy-saga-templates"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.deployment-view-saga-graph-contract.deployment-view"
		protobufMessage:  "DeploymentViewSagaGraphContractDeploymentViewDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DeploymentViewSagaGraphContractDeploymentViewDataModel"
		sourcePath:       "src/draft/deployment-view-saga-graph-contract/src/deployment-view.ts"
		packageName:      "deployment-view-saga-graph-contract"
		domain:           "deployment-view-saga-graph"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.devops-canary-rollout-journey-contract.devops-canary-rollout-journey"
		protobufMessage:  "DevopsCanaryRolloutJourneyContractDevopsCanaryRolloutJourneyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DevopsCanaryRolloutJourneyContractDevopsCanaryRolloutJourneyDataModel"
		sourcePath:       "src/draft/devops-canary-rollout-journey-contract/src/devops-canary-rollout-journey.ts"
		packageName:      "devops-canary-rollout-journey-contract"
		domain:           "devops-canary-rollout-journey"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.devops-self-host-yard-journey-contract.devops-self-host-yard-journey"
		protobufMessage:  "DevopsSelfHostYardJourneyContractDevopsSelfHostYardJourneyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DevopsSelfHostYardJourneyContractDevopsSelfHostYardJourneyDataModel"
		sourcePath:       "src/draft/devops-self-host-yard-journey-contract/src/devops-self-host-yard-journey.ts"
		packageName:      "devops-self-host-yard-journey-contract"
		domain:           "devops-self-host-yard-journey"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.disaster-recovery-failover-contract.disaster-recovery-failover"
		protobufMessage:  "DisasterRecoveryFailoverContractDisasterRecoveryFailoverDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DisasterRecoveryFailoverContractDisasterRecoveryFailoverDataModel"
		sourcePath:       "src/draft/disaster-recovery-failover-contract/src/disaster-recovery-failover.ts"
		packageName:      "disaster-recovery-failover-contract"
		domain:           "disaster-recovery-failover"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.dispatcher-maximize-credits-contract.dispatcher"
		protobufMessage:  "DispatcherMaximizeCreditsContractDispatcherDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DispatcherMaximizeCreditsContractDispatcherDataModel"
		sourcePath:       "src/draft/dispatcher-maximize-credits-contract/src/dispatcher.ts"
		packageName:      "dispatcher-maximize-credits-contract"
		domain:           "dispatcher-maximize-credits"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.distributed-artifact-resolver-contract.distributed-artifact-resolver"
		protobufMessage:  "DistributedArtifactResolverContractDistributedArtifactResolverDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DistributedArtifactResolverContractDistributedArtifactResolverDataModel"
		sourcePath:       "src/draft/distributed-artifact-resolver-contract/src/distributed-artifact-resolver.ts"
		packageName:      "distributed-artifact-resolver-contract"
		domain:           "distributed-artifact-resolver"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.distributed-artifact-version-policy.version-policy"
		protobufMessage:  "DistributedArtifactVersionPolicyVersionPolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DistributedArtifactVersionPolicyVersionPolicyDataModel"
		sourcePath:       "src/draft/distributed-artifact-version-policy/src/version-policy.ts"
		packageName:      "distributed-artifact-version-policy"
		domain:           "distributed-artifact-version-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.dns-validation-gate-threat-model.threat-model"
		protobufMessage:  "DnsValidationGateThreatModelThreatModelDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DnsValidationGateThreatModelThreatModelDataModel"
		sourcePath:       "src/draft/dns-validation-gate-threat-model/src/threat-model.ts"
		packageName:      "dns-validation-gate-threat-model"
		domain:           "dns-validation-gate-threat-model"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.dns-validation-rebinding-guard-contract.dns-validation-rebinding-guard"
		protobufMessage:  "DnsValidationRebindingGuardContractDnsValidationRebindingGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DnsValidationRebindingGuardContractDnsValidationRebindingGuardDataModel"
		sourcePath:       "src/draft/dns-validation-rebinding-guard-contract/src/dns-validation-rebinding-guard.ts"
		packageName:      "dns-validation-rebinding-guard-contract"
		domain:           "dns-validation-rebinding-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.document-projection-sink-contract.document-projection-sink"
		protobufMessage:  "DocumentProjectionSinkContractDocumentProjectionSinkDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DocumentProjectionSinkContractDocumentProjectionSinkDataModel"
		sourcePath:       "src/draft/document-projection-sink-contract/src/document-projection-sink.ts"
		packageName:      "document-projection-sink-contract"
		domain:           "document-projection-sink"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.domain-cutover-saga-contract.domain-cutover-saga"
		protobufMessage:  "DomainCutoverSagaContractDomainCutoverSagaDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DomainCutoverSagaContractDomainCutoverSagaDataModel"
		sourcePath:       "src/draft/domain-cutover-saga-contract/src/domain-cutover-saga.ts"
		packageName:      "domain-cutover-saga-contract"
		domain:           "domain-cutover-saga"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.domain-event-body-contract.domain-event-body-contract"
		protobufMessage:  "DomainEventBodyContractDomainEventBodyContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DomainEventBodyContractDomainEventBodyContractDataModel"
		sourcePath:       "src/draft/domain-event-body-contract/src/domain-event-body-contract.ts"
		packageName:      "domain-event-body-contract"
		domain:           "domain-event-body"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.domain-validation-gate-contract.domain-validation-gate"
		protobufMessage:  "DomainValidationGateContractDomainValidationGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DomainValidationGateContractDomainValidationGateDataModel"
		sourcePath:       "src/draft/domain-validation-gate-contract/src/domain-validation-gate.ts"
		packageName:      "domain-validation-gate-contract"
		domain:           "domain-validation-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.dr-failover-integrity-contract.dr-failover-integrity"
		protobufMessage:  "DrFailoverIntegrityContractDrFailoverIntegrityDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DrFailoverIntegrityContractDrFailoverIntegrityDataModel"
		sourcePath:       "src/draft/dr-failover-integrity-contract/src/dr-failover-integrity.ts"
		packageName:      "dr-failover-integrity-contract"
		domain:           "dr-failover-integrity"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.drift-detection-loop-contract.drift-detection-loop"
		protobufMessage:  "DriftDetectionLoopContractDriftDetectionLoopDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DriftDetectionLoopContractDriftDetectionLoopDataModel"
		sourcePath:       "src/draft/drift-detection-loop-contract/src/drift-detection-loop.ts"
		packageName:      "drift-detection-loop-contract"
		domain:           "drift-detection-loop"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.drift-orphan-sweep-contract.drift-orphan-sweep"
		protobufMessage:  "DriftOrphanSweepContractDriftOrphanSweepDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DriftOrphanSweepContractDriftOrphanSweepDataModel"
		sourcePath:       "src/draft/drift-orphan-sweep-contract/src/drift-orphan-sweep.ts"
		packageName:      "drift-orphan-sweep-contract"
		domain:           "drift-orphan-sweep"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.driver-dispatch-routing-contract.driver-dispatch-routing"
		protobufMessage:  "DriverDispatchRoutingContractDriverDispatchRoutingDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#DriverDispatchRoutingContractDriverDispatchRoutingDataModel"
		sourcePath:       "src/draft/driver-dispatch-routing-contract/src/driver-dispatch-routing.ts"
		packageName:      "driver-dispatch-routing-contract"
		domain:           "driver-dispatch-routing"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.end-user-authorization-policy-contract.end-user-authorization-policy"
		protobufMessage:  "EndUserAuthorizationPolicyContractEndUserAuthorizationPolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#EndUserAuthorizationPolicyContractEndUserAuthorizationPolicyDataModel"
		sourcePath:       "src/draft/end-user-authorization-policy-contract/src/end-user-authorization-policy.ts"
		packageName:      "end-user-authorization-policy-contract"
		domain:           "end-user-authorization-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.endpoint-monitor-operator-contract.endpoint-monitor-operator"
		protobufMessage:  "EndpointMonitorOperatorContractEndpointMonitorOperatorDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#EndpointMonitorOperatorContractEndpointMonitorOperatorDataModel"
		sourcePath:       "src/draft/endpoint-monitor-operator-contract/src/endpoint-monitor-operator.ts"
		packageName:      "endpoint-monitor-operator-contract"
		domain:           "endpoint-monitor-operator"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.error-budget-deploy-gate-contract.error-budget-deploy-gate"
		protobufMessage:  "ErrorBudgetDeployGateContractErrorBudgetDeployGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ErrorBudgetDeployGateContractErrorBudgetDeployGateDataModel"
		sourcePath:       "src/draft/error-budget-deploy-gate-contract/src/error-budget-deploy-gate.ts"
		packageName:      "error-budget-deploy-gate-contract"
		domain:           "error-budget-deploy-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.eval-promotion-gate-contract.eval-promotion-gate"
		protobufMessage:  "EvalPromotionGateContractEvalPromotionGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#EvalPromotionGateContractEvalPromotionGateDataModel"
		sourcePath:       "src/draft/eval-promotion-gate-contract/src/eval-promotion-gate.ts"
		packageName:      "eval-promotion-gate-contract"
		domain:           "eval-promotion-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.event-body-upcaster-gate.event-body-upcaster-gate"
		protobufMessage:  "EventBodyUpcasterGateEventBodyUpcasterGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#EventBodyUpcasterGateEventBodyUpcasterGateDataModel"
		sourcePath:       "src/draft/event-body-upcaster-gate/src/event-body-upcaster-gate.ts"
		packageName:      "event-body-upcaster-gate"
		domain:           "event-body-upcaster-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.example-apps-scope-acceptance.example-apps-scope"
		protobufMessage:  "ExampleAppsScopeAcceptanceExampleAppsScopeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ExampleAppsScopeAcceptanceExampleAppsScopeDataModel"
		sourcePath:       "src/draft/example-apps-scope-acceptance/src/example-apps-scope.ts"
		packageName:      "example-apps-scope-acceptance"
		domain:           "example-apps-scope-acceptance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.execution-host-provider-contract.execution-host-provider"
		protobufMessage:  "ExecutionHostProviderContractExecutionHostProviderDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ExecutionHostProviderContractExecutionHostProviderDataModel"
		sourcePath:       "src/draft/execution-host-provider-contract/src/execution-host-provider.ts"
		packageName:      "execution-host-provider-contract"
		domain:           "execution-host-provider"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.executor-skeleton-contract.executor-skeleton"
		protobufMessage:  "ExecutorSkeletonContractExecutorSkeletonDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ExecutorSkeletonContractExecutorSkeletonDataModel"
		sourcePath:       "src/draft/executor-skeleton-contract/src/executor-skeleton.ts"
		packageName:      "executor-skeleton-contract"
		domain:           "executor-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.experiment-statistical-analysis-contract.experiment-statistical-analysis"
		protobufMessage:  "ExperimentStatisticalAnalysisContractExperimentStatisticalAnalysisDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ExperimentStatisticalAnalysisContractExperimentStatisticalAnalysisDataModel"
		sourcePath:       "src/draft/experiment-statistical-analysis-contract/src/experiment-statistical-analysis.ts"
		packageName:      "experiment-statistical-analysis-contract"
		domain:           "experiment-statistical-analysis"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.failure-taxonomy-safe-fix-classifier.failure-taxonomy-classifier"
		protobufMessage:  "FailureTaxonomySafeFixClassifierFailureTaxonomyClassifierDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#FailureTaxonomySafeFixClassifierFailureTaxonomyClassifierDataModel"
		sourcePath:       "src/draft/failure-taxonomy-safe-fix-classifier/src/failure-taxonomy-classifier.ts"
		packageName:      "failure-taxonomy-safe-fix-classifier"
		domain:           "failure-taxonomy-safe-fix-classifier"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.feature-flag-governance-contract.feature-flag-governance"
		protobufMessage:  "FeatureFlagGovernanceContractFeatureFlagGovernanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#FeatureFlagGovernanceContractFeatureFlagGovernanceDataModel"
		sourcePath:       "src/draft/feature-flag-governance-contract/src/feature-flag-governance.ts"
		packageName:      "feature-flag-governance-contract"
		domain:           "feature-flag-governance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.federated-policy-pack-conflict-contract.federated-policy-pack-conflict"
		protobufMessage:  "FederatedPolicyPackConflictContractFederatedPolicyPackConflictDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#FederatedPolicyPackConflictContractFederatedPolicyPackConflictDataModel"
		sourcePath:       "src/draft/federated-policy-pack-conflict-contract/src/federated-policy-pack-conflict.ts"
		packageName:      "federated-policy-pack-conflict-contract"
		domain:           "federated-policy-pack-conflict"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.flag-debt-auto-cleanup-contract.flag-debt-auto-cleanup"
		protobufMessage:  "FlagDebtAutoCleanupContractFlagDebtAutoCleanupDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#FlagDebtAutoCleanupContractFlagDebtAutoCleanupDataModel"
		sourcePath:       "src/draft/flag-debt-auto-cleanup-contract/src/flag-debt-auto-cleanup.ts"
		packageName:      "flag-debt-auto-cleanup-contract"
		domain:           "flag-debt-auto-cleanup"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.flag-event-contract.flag-event-contract"
		protobufMessage:  "FlagEventContractFlagEventContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#FlagEventContractFlagEventContractDataModel"
		sourcePath:       "src/draft/flag-event-contract/src/flag-event-contract.ts"
		packageName:      "flag-event-contract"
		domain:           "flag-event"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.flag-partition-consistency-contract.flag-partition-consistency"
		protobufMessage:  "FlagPartitionConsistencyContractFlagPartitionConsistencyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#FlagPartitionConsistencyContractFlagPartitionConsistencyDataModel"
		sourcePath:       "src/draft/flag-partition-consistency-contract/src/flag-partition-consistency.ts"
		packageName:      "flag-partition-consistency-contract"
		domain:           "flag-partition-consistency"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.flag-ruleset-sync-contract.flag-ruleset-sync"
		protobufMessage:  "FlagRulesetSyncContractFlagRulesetSyncDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#FlagRulesetSyncContractFlagRulesetSyncDataModel"
		sourcePath:       "src/draft/flag-ruleset-sync-contract/src/flag-ruleset-sync.ts"
		packageName:      "flag-ruleset-sync-contract"
		domain:           "flag-ruleset-sync"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.full-text-search-contract.full-text-search-contract"
		protobufMessage:  "FullTextSearchContractFullTextSearchContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#FullTextSearchContractFullTextSearchContractDataModel"
		sourcePath:       "src/draft/full-text-search-contract/src/full-text-search-contract.ts"
		packageName:      "full-text-search-contract"
		domain:           "full-text-search"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.gated-autonomous-remediation-contract.gated-autonomous-remediation"
		protobufMessage:  "GatedAutonomousRemediationContractGatedAutonomousRemediationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GatedAutonomousRemediationContractGatedAutonomousRemediationDataModel"
		sourcePath:       "src/draft/gated-autonomous-remediation-contract/src/gated-autonomous-remediation.ts"
		packageName:      "gated-autonomous-remediation-contract"
		domain:           "gated-autonomous-remediation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.gatekeeper-verify-contract.gatekeeper-verify"
		protobufMessage:  "GatekeeperVerifyContractGatekeeperVerifyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GatekeeperVerifyContractGatekeeperVerifyDataModel"
		sourcePath:       "src/draft/gatekeeper-verify-contract/src/gatekeeper-verify.ts"
		packageName:      "gatekeeper-verify-contract"
		domain:           "gatekeeper-verify"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.gateway-realization-contract.gateway-realization"
		protobufMessage:  "GatewayRealizationContractGatewayRealizationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GatewayRealizationContractGatewayRealizationDataModel"
		sourcePath:       "src/draft/gateway-realization-contract/src/gateway-realization.ts"
		packageName:      "gateway-realization-contract"
		domain:           "gateway-realization"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generateprovider-correctness-spike.correctness-spike"
		protobufMessage:  "GenerateproviderCorrectnessSpikeCorrectnessSpikeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerateproviderCorrectnessSpikeCorrectnessSpikeDataModel"
		sourcePath:       "src/draft/generateprovider-correctness-spike/src/correctness-spike.ts"
		packageName:      "generateprovider-correctness-spike"
		domain:           "generateprovider-correctness"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-bounded-repair-loop-contract.bounded-repair-loop"
		protobufMessage:  "GenerationBoundedRepairLoopContractBoundedRepairLoopDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationBoundedRepairLoopContractBoundedRepairLoopDataModel"
		sourcePath:       "src/draft/generation-bounded-repair-loop-contract/src/bounded-repair-loop.ts"
		packageName:      "generation-bounded-repair-loop-contract"
		domain:           "generation-bounded-repair-loop"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-certify-stage-contract.certify-stage"
		protobufMessage:  "GenerationCertifyStageContractCertifyStageDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationCertifyStageContractCertifyStageDataModel"
		sourcePath:       "src/draft/generation-certify-stage-contract/src/certify-stage.ts"
		packageName:      "generation-certify-stage-contract"
		domain:           "generation-certify-stage"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-eval-methodology-spike.methodology"
		protobufMessage:  "GenerationEvalMethodologySpikeMethodologyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationEvalMethodologySpikeMethodologyDataModel"
		sourcePath:       "src/draft/generation-eval-methodology-spike/src/methodology.ts"
		packageName:      "generation-eval-methodology-spike"
		domain:           "generation-eval-methodology"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-llm-fill-contract.fill"
		protobufMessage:  "GenerationLlmFillContractFillDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationLlmFillContractFillDataModel"
		sourcePath:       "src/draft/generation-llm-fill-contract/src/fill.ts"
		packageName:      "generation-llm-fill-contract"
		domain:           "generation-llm-fill"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-material-sanitization-contract.material-sanitization"
		protobufMessage:  "GenerationMaterialSanitizationContractMaterialSanitizationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationMaterialSanitizationContractMaterialSanitizationDataModel"
		sourcePath:       "src/draft/generation-material-sanitization-contract/src/material-sanitization.ts"
		packageName:      "generation-material-sanitization-contract"
		domain:           "generation-material-sanitization"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-pipeline-io-contract.contract"
		protobufMessage:  "GenerationPipelineIoContractContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationPipelineIoContractContractDataModel"
		sourcePath:       "src/draft/generation-pipeline-io-contract/src/contract.ts"
		packageName:      "generation-pipeline-io-contract"
		domain:           "generation-pipeline-io"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-promotion-policy-gate-contract.promotion-gate"
		protobufMessage:  "GenerationPromotionPolicyGateContractPromotionGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationPromotionPolicyGateContractPromotionGateDataModel"
		sourcePath:       "src/draft/generation-promotion-policy-gate-contract/src/promotion-gate.ts"
		packageName:      "generation-promotion-policy-gate-contract"
		domain:           "generation-promotion-policy-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-provider-loop-contract.generate-provider"
		protobufMessage:  "GenerationProviderLoopContractGenerateProviderDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationProviderLoopContractGenerateProviderDataModel"
		sourcePath:       "src/draft/generation-provider-loop-contract/src/generate-provider.ts"
		packageName:      "generation-provider-loop-contract"
		domain:           "generation-provider-loop"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-reference-run-contract.generation-reference-run"
		protobufMessage:  "GenerationReferenceRunContractGenerationReferenceRunDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationReferenceRunContractGenerationReferenceRunDataModel"
		sourcePath:       "src/draft/generation-reference-run-contract/src/generation-reference-run.ts"
		packageName:      "generation-reference-run-contract"
		domain:           "generation-reference-run"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-safety-gate-contract.safety-gate"
		protobufMessage:  "GenerationSafetyGateContractSafetyGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationSafetyGateContractSafetyGateDataModel"
		sourcePath:       "src/draft/generation-safety-gate-contract/src/safety-gate.ts"
		packageName:      "generation-safety-gate-contract"
		domain:           "generation-safety-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-scaffold-stage-contract.scaffold"
		protobufMessage:  "GenerationScaffoldStageContractScaffoldDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationScaffoldStageContractScaffoldDataModel"
		sourcePath:       "src/draft/generation-scaffold-stage-contract/src/scaffold.ts"
		packageName:      "generation-scaffold-stage-contract"
		domain:           "generation-scaffold-stage"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.generation-validation-stage-contract.validation-stage"
		protobufMessage:  "GenerationValidationStageContractValidationStageDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenerationValidationStageContractValidationStageDataModel"
		sourcePath:       "src/draft/generation-validation-stage-contract/src/validation-stage.ts"
		packageName:      "generation-validation-stage-contract"
		domain:           "generation-validation-stage"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.genesis-breakglass-contract.genesis-breakglass"
		protobufMessage:  "GenesisBreakglassContractGenesisBreakglassDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GenesisBreakglassContractGenesisBreakglassDataModel"
		sourcePath:       "src/draft/genesis-breakglass-contract/src/genesis-breakglass.ts"
		packageName:      "genesis-breakglass-contract"
		domain:           "genesis-breakglass"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.gitops-ci-journey-contract.gitops-ci-journey"
		protobufMessage:  "GitopsCiJourneyContractGitopsCiJourneyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GitopsCiJourneyContractGitopsCiJourneyDataModel"
		sourcePath:       "src/draft/gitops-ci-journey-contract/src/gitops-ci-journey.ts"
		packageName:      "gitops-ci-journey-contract"
		domain:           "gitops-ci-journey"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.golden-suite-chaos-verification-contract.golden-suite-chaos-verification"
		protobufMessage:  "GoldenSuiteChaosVerificationContractGoldenSuiteChaosVerificationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GoldenSuiteChaosVerificationContractGoldenSuiteChaosVerificationDataModel"
		sourcePath:       "src/draft/golden-suite-chaos-verification-contract/src/golden-suite-chaos-verification.ts"
		packageName:      "golden-suite-chaos-verification-contract"
		domain:           "golden-suite-chaos-verification"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.governance-conformance-suite-contract.governance-conformance-suite"
		protobufMessage:  "GovernanceConformanceSuiteContractGovernanceConformanceSuiteDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GovernanceConformanceSuiteContractGovernanceConformanceSuiteDataModel"
		sourcePath:       "src/draft/governance-conformance-suite-contract/src/governance-conformance-suite.ts"
		packageName:      "governance-conformance-suite-contract"
		domain:           "governance-conformance-suite"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.graphql-facade-generation-poc.graphql-facade-generator"
		protobufMessage:  "GraphqlFacadeGenerationPocGraphqlFacadeGeneratorDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GraphqlFacadeGenerationPocGraphqlFacadeGeneratorDataModel"
		sourcePath:       "src/draft/graphql-facade-generation-poc/src/graphql-facade-generator.ts"
		packageName:      "graphql-facade-generation-poc"
		domain:           "graphql-facade-generation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.graphql-facade-runtime-contract.graphql-facade-runtime"
		protobufMessage:  "GraphqlFacadeRuntimeContractGraphqlFacadeRuntimeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GraphqlFacadeRuntimeContractGraphqlFacadeRuntimeDataModel"
		sourcePath:       "src/draft/graphql-facade-runtime-contract/src/graphql-facade-runtime.ts"
		packageName:      "graphql-facade-runtime-contract"
		domain:           "graphql-facade-runtime"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.guardrail-policy-gate-contract.guardrail-policy-gate"
		protobufMessage:  "GuardrailPolicyGateContractGuardrailPolicyGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#GuardrailPolicyGateContractGuardrailPolicyGateDataModel"
		sourcePath:       "src/draft/guardrail-policy-gate-contract/src/guardrail-policy-gate.ts"
		packageName:      "guardrail-policy-gate-contract"
		domain:           "guardrail-policy-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-add-install-verification-contract.hobo-add-install-verification"
		protobufMessage:  "HoboAddInstallVerificationContractHoboAddInstallVerificationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboAddInstallVerificationContractHoboAddInstallVerificationDataModel"
		sourcePath:       "src/draft/hobo-add-install-verification-contract/src/hobo-add-install-verification.ts"
		packageName:      "hobo-add-install-verification-contract"
		domain:           "hobo-add-install-verification"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-async-building-block-ports.contract"
		protobufMessage:  "HoboAsyncBuildingBlockPortsContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboAsyncBuildingBlockPortsContractDataModel"
		sourcePath:       "src/draft/hobo-async-building-block-ports/src/contract.ts"
		packageName:      "hobo-async-building-block-ports"
		domain:           "hobo-async-building-block-ports"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-auth-authoring-surface.auth-authoring-surface"
		protobufMessage:  "HoboAuthAuthoringSurfaceAuthAuthoringSurfaceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboAuthAuthoringSurfaceAuthAuthoringSurfaceDataModel"
		sourcePath:       "src/draft/hobo-auth-authoring-surface/src/auth-authoring-surface.ts"
		packageName:      "hobo-auth-authoring-surface"
		domain:           "hobo-auth-authoring-surface"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-auth-consumer-contract.auth-consumer-contract"
		protobufMessage:  "HoboAuthConsumerContractAuthConsumerContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboAuthConsumerContractAuthConsumerContractDataModel"
		sourcePath:       "src/draft/hobo-auth-consumer-contract/src/auth-consumer-contract.ts"
		packageName:      "hobo-auth-consumer-contract"
		domain:           "hobo-auth-consumer"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-auth-federate-verify-contract.auth-federate-verify"
		protobufMessage:  "HoboAuthFederateVerifyContractAuthFederateVerifyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboAuthFederateVerifyContractAuthFederateVerifyDataModel"
		sourcePath:       "src/draft/hobo-auth-federate-verify-contract/src/auth-federate-verify.ts"
		packageName:      "hobo-auth-federate-verify-contract"
		domain:           "hobo-auth-federate-verify"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-auth-json-contract.auth-json"
		protobufMessage:  "HoboAuthJsonContractAuthJsonDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboAuthJsonContractAuthJsonDataModel"
		sourcePath:       "src/draft/hobo-auth-json-contract/src/auth-json.ts"
		packageName:      "hobo-auth-json-contract"
		domain:           "hobo-auth-json"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-bindles-resource-catalog.catalog"
		protobufMessage:  "HoboBindlesResourceCatalogCatalogDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboBindlesResourceCatalogCatalogDataModel"
		sourcePath:       "src/draft/hobo-bindles-resource-catalog/src/catalog.ts"
		packageName:      "hobo-bindles-resource-catalog"
		domain:           "hobo-bindles-resource-catalog"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-build-cli-contract.build-cli-contract"
		protobufMessage:  "HoboBuildCliContractBuildCliContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboBuildCliContractBuildCliContractDataModel"
		sourcePath:       "src/draft/hobo-build-cli-contract/src/build-cli-contract.ts"
		packageName:      "hobo-build-cli-contract"
		domain:           "hobo-build-cli"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-cli-shell-contract.cli-shell"
		protobufMessage:  "HoboCliShellContractCliShellDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboCliShellContractCliShellDataModel"
		sourcePath:       "src/draft/hobo-cli-shell-contract/src/cli-shell.ts"
		packageName:      "hobo-cli-shell-contract"
		domain:           "hobo-cli-shell"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-code-dsl-contract.hobo-code-dsl"
		protobufMessage:  "HoboCodeDslContractHoboCodeDslDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboCodeDslContractHoboCodeDslDataModel"
		sourcePath:       "src/draft/hobo-code-dsl-contract/src/hobo-code-dsl.ts"
		packageName:      "hobo-code-dsl-contract"
		domain:           "hobo-code-dsl"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-codegen-cli-contract.codegen-cli-contract"
		protobufMessage:  "HoboCodegenCliContractCodegenCliContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboCodegenCliContractCodegenCliContractDataModel"
		sourcePath:       "src/draft/hobo-codegen-cli-contract/src/codegen-cli-contract.ts"
		packageName:      "hobo-codegen-cli-contract"
		domain:           "hobo-codegen-cli"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-collect-cli-contract.collect-cli"
		protobufMessage:  "HoboCollectCliContractCollectCliDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboCollectCliContractCollectCliDataModel"
		sourcePath:       "src/draft/hobo-collect-cli-contract/src/collect-cli.ts"
		packageName:      "hobo-collect-cli-contract"
		domain:           "hobo-collect-cli"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-componentize-contract.componentize-contract"
		protobufMessage:  "HoboComponentizeContractComponentizeContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboComponentizeContractComponentizeContractDataModel"
		sourcePath:       "src/draft/hobo-componentize-contract/src/componentize-contract.ts"
		packageName:      "hobo-componentize-contract"
		domain:           "hobo-componentize"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-config-secret-schema-contract.config-schema"
		protobufMessage:  "HoboConfigSecretSchemaContractConfigSchemaDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboConfigSecretSchemaContractConfigSchemaDataModel"
		sourcePath:       "src/draft/hobo-config-secret-schema-contract/src/config-schema.ts"
		packageName:      "hobo-config-secret-schema-contract"
		domain:           "hobo-config-secret-schema"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-contract-ir.contract-ir"
		protobufMessage:  "HoboContractIrContractIrDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboContractIrContractIrDataModel"
		sourcePath:       "src/draft/hobo-contract-ir/src/contract-ir.ts"
		packageName:      "hobo-contract-ir"
		domain:           "hobo-contract-ir"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-core-contract.core-contract"
		protobufMessage:  "HoboCoreContractCoreContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboCoreContractCoreContractDataModel"
		sourcePath:       "src/draft/hobo-core-contract/src/core-contract.ts"
		packageName:      "hobo-core-contract"
		domain:           "hobo-core"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-delivery-port.delivery-contract"
		protobufMessage:  "HoboDeliveryPortDeliveryContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboDeliveryPortDeliveryContractDataModel"
		sourcePath:       "src/draft/hobo-delivery-port/src/delivery-contract.ts"
		packageName:      "hobo-delivery-port"
		domain:           "hobo-delivery-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-dev-fidelity-drift-contract.dev-fidelity-drift"
		protobufMessage:  "HoboDevFidelityDriftContractDevFidelityDriftDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboDevFidelityDriftContractDevFidelityDriftDataModel"
		sourcePath:       "src/draft/hobo-dev-fidelity-drift-contract/src/dev-fidelity-drift.ts"
		packageName:      "hobo-dev-fidelity-drift-contract"
		domain:           "hobo-dev-fidelity-drift"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-dev-loop-contract.dev-loop"
		protobufMessage:  "HoboDevLoopContractDevLoopDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboDevLoopContractDevLoopDataModel"
		sourcePath:       "src/draft/hobo-dev-loop-contract/src/dev-loop.ts"
		packageName:      "hobo-dev-loop-contract"
		domain:           "hobo-dev-loop"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-dns-port-contract.dns-port"
		protobufMessage:  "HoboDnsPortContractDnsPortDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboDnsPortContractDnsPortDataModel"
		sourcePath:       "src/draft/hobo-dns-port-contract/src/dns-port.ts"
		packageName:      "hobo-dns-port-contract"
		domain:           "hobo-dns-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-doctor-contract.doctor-contract"
		protobufMessage:  "HoboDoctorContractDoctorContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboDoctorContractDoctorContractDataModel"
		sourcePath:       "src/draft/hobo-doctor-contract/src/doctor-contract.ts"
		packageName:      "hobo-doctor-contract"
		domain:           "hobo-doctor"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-down-lifecycle-contract.down-lifecycle"
		protobufMessage:  "HoboDownLifecycleContractDownLifecycleDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboDownLifecycleContractDownLifecycleDataModel"
		sourcePath:       "src/draft/hobo-down-lifecycle-contract/src/down-lifecycle.ts"
		packageName:      "hobo-down-lifecycle-contract"
		domain:           "hobo-down-lifecycle"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-experiment-port.experiment-contract"
		protobufMessage:  "HoboExperimentPortExperimentContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboExperimentPortExperimentContractDataModel"
		sourcePath:       "src/draft/hobo-experiment-port/src/experiment-contract.ts"
		packageName:      "hobo-experiment-port"
		domain:           "hobo-experiment-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-feature-flag-port.evaluator"
		protobufMessage:  "HoboFeatureFlagPortEvaluatorDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboFeatureFlagPortEvaluatorDataModel"
		sourcePath:       "src/draft/hobo-feature-flag-port/src/evaluator.ts"
		packageName:      "hobo-feature-flag-port"
		domain:           "hobo-feature-flag-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-gateway-port.gateway-contract"
		protobufMessage:  "HoboGatewayPortGatewayContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboGatewayPortGatewayContractDataModel"
		sourcePath:       "src/draft/hobo-gateway-port/src/gateway-contract.ts"
		packageName:      "hobo-gateway-port"
		domain:           "hobo-gateway-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-inspect-projection-contract.inspect-contract"
		protobufMessage:  "HoboInspectProjectionContractInspectContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboInspectProjectionContractInspectContractDataModel"
		sourcePath:       "src/draft/hobo-inspect-projection-contract/src/inspect-contract.ts"
		packageName:      "hobo-inspect-projection-contract"
		domain:           "hobo-inspect-projection"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-jwt-svid-contract.jwt-svid"
		protobufMessage:  "HoboJwtSvidContractJwtSvidDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboJwtSvidContractJwtSvidDataModel"
		sourcePath:       "src/draft/hobo-jwt-svid-contract/src/jwt-svid.ts"
		packageName:      "hobo-jwt-svid-contract"
		domain:           "hobo-jwt-svid"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-login-claim-contract.login-claim-contract"
		protobufMessage:  "HoboLoginClaimContractLoginClaimContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboLoginClaimContractLoginClaimContractDataModel"
		sourcePath:       "src/draft/hobo-login-claim-contract/src/login-claim-contract.ts"
		packageName:      "hobo-login-claim-contract"
		domain:           "hobo-login-claim"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-logs-cli-contract.logs-cli"
		protobufMessage:  "HoboLogsCliContractLogsCliDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboLogsCliContractLogsCliDataModel"
		sourcePath:       "src/draft/hobo-logs-cli-contract/src/logs-cli.ts"
		packageName:      "hobo-logs-cli-contract"
		domain:           "hobo-logs-cli"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-manifest-contract.manifest"
		protobufMessage:  "HoboManifestContractManifestDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboManifestContractManifestDataModel"
		sourcePath:       "src/draft/hobo-manifest-contract/src/manifest.ts"
		packageName:      "hobo-manifest-contract"
		domain:           "hobo-manifest"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-mcp-server-contract.mcp-server-contract"
		protobufMessage:  "HoboMcpServerContractMcpServerContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboMcpServerContractMcpServerContractDataModel"
		sourcePath:       "src/draft/hobo-mcp-server-contract/src/mcp-server-contract.ts"
		packageName:      "hobo-mcp-server-contract"
		domain:           "hobo-mcp-server"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-mcp-server-contract.mcp-svid-auth"
		protobufMessage:  "HoboMcpServerContractMcpSvidAuthDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboMcpServerContractMcpSvidAuthDataModel"
		sourcePath:       "src/draft/hobo-mcp-server-contract/src/mcp-svid-auth.ts"
		packageName:      "hobo-mcp-server-contract"
		domain:           "hobo-mcp-server"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-monorepo-skeleton-contract.monorepo-skeleton-contract"
		protobufMessage:  "HoboMonorepoSkeletonContractMonorepoSkeletonContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboMonorepoSkeletonContractMonorepoSkeletonContractDataModel"
		sourcePath:       "src/draft/hobo-monorepo-skeleton-contract/src/monorepo-skeleton-contract.ts"
		packageName:      "hobo-monorepo-skeleton-contract"
		domain:           "hobo-monorepo-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-new-scaffold-contract.scaffold"
		protobufMessage:  "HoboNewScaffoldContractScaffoldDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboNewScaffoldContractScaffoldDataModel"
		sourcePath:       "src/draft/hobo-new-scaffold-contract/src/scaffold.ts"
		packageName:      "hobo-new-scaffold-contract"
		domain:           "hobo-new-scaffold"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-package-namespace-map.package-namespace-map"
		protobufMessage:  "HoboPackageNamespaceMapPackageNamespaceMapDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboPackageNamespaceMapPackageNamespaceMapDataModel"
		sourcePath:       "src/draft/hobo-package-namespace-map/src/package-namespace-map.ts"
		packageName:      "hobo-package-namespace-map"
		domain:           "hobo-package-namespace-map"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-plan-preview-contract.plan-preview"
		protobufMessage:  "HoboPlanPreviewContractPlanPreviewDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboPlanPreviewContractPlanPreviewDataModel"
		sourcePath:       "src/draft/hobo-plan-preview-contract/src/plan-preview.ts"
		packageName:      "hobo-plan-preview-contract"
		domain:           "hobo-plan-preview"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-policy-ir-contract.policy-ir"
		protobufMessage:  "HoboPolicyIrContractPolicyIrDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboPolicyIrContractPolicyIrDataModel"
		sourcePath:       "src/draft/hobo-policy-ir-contract/src/policy-ir.ts"
		packageName:      "hobo-policy-ir-contract"
		domain:           "hobo-policy-ir"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-principal-ref-contract.principal-ref"
		protobufMessage:  "HoboPrincipalRefContractPrincipalRefDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboPrincipalRefContractPrincipalRefDataModel"
		sourcePath:       "src/draft/hobo-principal-ref-contract/src/principal-ref.ts"
		packageName:      "hobo-principal-ref-contract"
		domain:           "hobo-principal-ref"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-projection-port-contract.projection-contract"
		protobufMessage:  "HoboProjectionPortContractProjectionContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboProjectionPortContractProjectionContractDataModel"
		sourcePath:       "src/draft/hobo-projection-port-contract/src/projection-contract.ts"
		packageName:      "hobo-projection-port-contract"
		domain:           "hobo-projection-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-realize-emission-contract.realize-emission-contract"
		protobufMessage:  "HoboRealizeEmissionContractRealizeEmissionContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboRealizeEmissionContractRealizeEmissionContractDataModel"
		sourcePath:       "src/draft/hobo-realize-emission-contract/src/realize-emission-contract.ts"
		packageName:      "hobo-realize-emission-contract"
		domain:           "hobo-realize-emission"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-relay-contract.hobo-relay"
		protobufMessage:  "HoboRelayContractHoboRelayDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboRelayContractHoboRelayDataModel"
		sourcePath:       "src/draft/hobo-relay-contract/src/hobo-relay.ts"
		packageName:      "hobo-relay-contract"
		domain:           "hobo-relay"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-remediation-action-contract.remediation-action-contract"
		protobufMessage:  "HoboRemediationActionContractRemediationActionContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboRemediationActionContractRemediationActionContractDataModel"
		sourcePath:       "src/draft/hobo-remediation-action-contract/src/remediation-action-contract.ts"
		packageName:      "hobo-remediation-action-contract"
		domain:           "hobo-remediation-action"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-runtime-primitives.runtime-primitives"
		protobufMessage:  "HoboRuntimePrimitivesRuntimePrimitivesDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboRuntimePrimitivesRuntimePrimitivesDataModel"
		sourcePath:       "src/draft/hobo-runtime-primitives/src/runtime-primitives.ts"
		packageName:      "hobo-runtime-primitives"
		domain:           "hobo-runtime-primitives"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-sdk-aggregate-wit-contract.reverse-extraction"
		protobufMessage:  "HoboSdkAggregateWitContractReverseExtractionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboSdkAggregateWitContractReverseExtractionDataModel"
		sourcePath:       "src/draft/hobo-sdk-aggregate-wit-contract/src/reverse-extraction.ts"
		packageName:      "hobo-sdk-aggregate-wit-contract"
		domain:           "hobo-sdk-aggregate-wit"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-up-convergence-contract.up-convergence"
		protobufMessage:  "HoboUpConvergenceContractUpConvergenceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboUpConvergenceContractUpConvergenceDataModel"
		sourcePath:       "src/draft/hobo-up-convergence-contract/src/up-convergence.ts"
		packageName:      "hobo-up-convergence-contract"
		domain:           "hobo-up-convergence"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.hobo-wit-toolchain-contract.wit-toolchain-contract"
		protobufMessage:  "HoboWitToolchainContractWitToolchainContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HoboWitToolchainContractWitToolchainContractDataModel"
		sourcePath:       "src/draft/hobo-wit-toolchain-contract/src/wit-toolchain-contract.ts"
		packageName:      "hobo-wit-toolchain-contract"
		domain:           "hobo-wit-toolchain"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.host-version-upgrade-contract.host-version-upgrade"
		protobufMessage:  "HostVersionUpgradeContractHostVersionUpgradeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HostVersionUpgradeContractHostVersionUpgradeDataModel"
		sourcePath:       "src/draft/host-version-upgrade-contract/src/host-version-upgrade.ts"
		packageName:      "host-version-upgrade-contract"
		domain:           "host-version-upgrade"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.human-approval-generation-gate-contract.human-approval-generation-gate"
		protobufMessage:  "HumanApprovalGenerationGateContractHumanApprovalGenerationGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HumanApprovalGenerationGateContractHumanApprovalGenerationGateDataModel"
		sourcePath:       "src/draft/human-approval-generation-gate-contract/src/human-approval-generation-gate.ts"
		packageName:      "human-approval-generation-gate-contract"
		domain:           "human-approval-generation-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.human-operator-console-contract.human-operator-console"
		protobufMessage:  "HumanOperatorConsoleContractHumanOperatorConsoleDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#HumanOperatorConsoleContractHumanOperatorConsoleDataModel"
		sourcePath:       "src/draft/human-operator-console-contract/src/human-operator-console.ts"
		packageName:      "human-operator-console-contract"
		domain:           "human-operator-console"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.iac-cdktf-import-only-contract.cdktf-import-only"
		protobufMessage:  "IacCdktfImportOnlyContractCdktfImportOnlyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IacCdktfImportOnlyContractCdktfImportOnlyDataModel"
		sourcePath:       "src/draft/iac-cdktf-import-only-contract/src/cdktf-import-only.ts"
		packageName:      "iac-cdktf-import-only-contract"
		domain:           "iac-cdktf-import-only"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.iac-crossplane-backend-contract.crossplane-iac-backend-contract"
		protobufMessage:  "IacCrossplaneBackendContractCrossplaneIacBackendContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IacCrossplaneBackendContractCrossplaneIacBackendContractDataModel"
		sourcePath:       "src/draft/iac-crossplane-backend-contract/src/crossplane-iac-backend-contract.ts"
		packageName:      "iac-crossplane-backend-contract"
		domain:           "iac-crossplane-backend"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.iac-drift-refresh-fidelity-contract.iac-drift-refresh-fidelity"
		protobufMessage:  "IacDriftRefreshFidelityContractIacDriftRefreshFidelityDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IacDriftRefreshFidelityContractIacDriftRefreshFidelityDataModel"
		sourcePath:       "src/draft/iac-drift-refresh-fidelity-contract/src/iac-drift-refresh-fidelity.ts"
		packageName:      "iac-drift-refresh-fidelity-contract"
		domain:           "iac-drift-refresh-fidelity"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.iac-opentofu-backend-contract.opentofu-iac-backend-contract"
		protobufMessage:  "IacOpentofuBackendContractOpentofuIacBackendContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IacOpentofuBackendContractOpentofuIacBackendContractDataModel"
		sourcePath:       "src/draft/iac-opentofu-backend-contract/src/opentofu-iac-backend-contract.ts"
		packageName:      "iac-opentofu-backend-contract"
		domain:           "iac-opentofu-backend"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.iac-partial-apply-compensation-contract.iac-partial-apply-compensation"
		protobufMessage:  "IacPartialApplyCompensationContractIacPartialApplyCompensationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IacPartialApplyCompensationContractIacPartialApplyCompensationDataModel"
		sourcePath:       "src/draft/iac-partial-apply-compensation-contract/src/iac-partial-apply-compensation.ts"
		packageName:      "iac-partial-apply-compensation-contract"
		domain:           "iac-partial-apply-compensation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.iac-pulumi-backend-contract.pulumi-iac-backend-contract"
		protobufMessage:  "IacPulumiBackendContractPulumiIacBackendContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IacPulumiBackendContractPulumiIacBackendContractDataModel"
		sourcePath:       "src/draft/iac-pulumi-backend-contract/src/pulumi-iac-backend-contract.ts"
		packageName:      "iac-pulumi-backend-contract"
		domain:           "iac-pulumi-backend"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.iac-state-model-contract.iac-state-model-contract"
		protobufMessage:  "IacStateModelContractIacStateModelContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IacStateModelContractIacStateModelContractDataModel"
		sourcePath:       "src/draft/iac-state-model-contract/src/iac-state-model-contract.ts"
		packageName:      "iac-state-model-contract"
		domain:           "iac-state-model"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.id-jag-threat-model-spike.threat-model"
		protobufMessage:  "IdJagThreatModelSpikeThreatModelDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IdJagThreatModelSpikeThreatModelDataModel"
		sourcePath:       "src/draft/id-jag-threat-model-spike/src/threat-model.ts"
		packageName:      "id-jag-threat-model-spike"
		domain:           "id-jag-threat-model"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.id-jag-token-exchange-contract.id-jag-token-exchange"
		protobufMessage:  "IdJagTokenExchangeContractIdJagTokenExchangeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IdJagTokenExchangeContractIdJagTokenExchangeDataModel"
		sourcePath:       "src/draft/id-jag-token-exchange-contract/src/id-jag-token-exchange.ts"
		packageName:      "id-jag-token-exchange-contract"
		domain:           "id-jag-token-exchange"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.identity-event-contract.identity-event-contract"
		protobufMessage:  "IdentityEventContractIdentityEventContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IdentityEventContractIdentityEventContractDataModel"
		sourcePath:       "src/draft/identity-event-contract/src/identity-event-contract.ts"
		packageName:      "identity-event-contract"
		domain:           "identity-event"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.identity-ocsf-export-contract.identity-ocsf-export"
		protobufMessage:  "IdentityOcsfExportContractIdentityOcsfExportDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IdentityOcsfExportContractIdentityOcsfExportDataModel"
		sourcePath:       "src/draft/identity-ocsf-export-contract/src/identity-ocsf-export.ts"
		packageName:      "identity-ocsf-export-contract"
		domain:           "identity-ocsf-export"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.idiom-layer-lowering-contract.lowering-contract"
		protobufMessage:  "IdiomLayerLoweringContractLoweringContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IdiomLayerLoweringContractLoweringContractDataModel"
		sourcePath:       "src/draft/idiom-layer-lowering-contract/src/lowering-contract.ts"
		packageName:      "idiom-layer-lowering-contract"
		domain:           "idiom-layer-lowering"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.idiom-semantics-annex.semantics-annex"
		protobufMessage:  "IdiomSemanticsAnnexSemanticsAnnexDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IdiomSemanticsAnnexSemanticsAnnexDataModel"
		sourcePath:       "src/draft/idiom-semantics-annex/src/semantics-annex.ts"
		packageName:      "idiom-semantics-annex"
		domain:           "idiom-semantics-annex"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.ifc-handler-trigger-contract.ifc-handler-trigger-contract"
		protobufMessage:  "IfcHandlerTriggerContractIfcHandlerTriggerContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IfcHandlerTriggerContractIfcHandlerTriggerContractDataModel"
		sourcePath:       "src/draft/ifc-handler-trigger-contract/src/ifc-handler-trigger-contract.ts"
		packageName:      "ifc-handler-trigger-contract"
		domain:           "ifc-handler-trigger"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.inbound-xaa-resource-server-contract.inbound-xaa-resource-server"
		protobufMessage:  "InboundXaaResourceServerContractInboundXaaResourceServerDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#InboundXaaResourceServerContractInboundXaaResourceServerDataModel"
		sourcePath:       "src/draft/inbound-xaa-resource-server-contract/src/inbound-xaa-resource-server.ts"
		packageName:      "inbound-xaa-resource-server-contract"
		domain:           "inbound-xaa-resource-server"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.incident-aggregate-contract.incident-aggregate"
		protobufMessage:  "IncidentAggregateContractIncidentAggregateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#IncidentAggregateContractIncidentAggregateDataModel"
		sourcePath:       "src/draft/incident-aggregate-contract/src/incident-aggregate.ts"
		packageName:      "incident-aggregate-contract"
		domain:           "incident-aggregate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.internal-ca-private-acme-contract.internal-ca-private-acme"
		protobufMessage:  "InternalCaPrivateAcmeContractInternalCaPrivateAcmeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#InternalCaPrivateAcmeContractInternalCaPrivateAcmeDataModel"
		sourcePath:       "src/draft/internal-ca-private-acme-contract/src/internal-ca-private-acme.ts"
		packageName:      "internal-ca-private-acme-contract"
		domain:           "internal-ca-private-acme"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.internal-service-discovery-contract.internal-service-discovery"
		protobufMessage:  "InternalServiceDiscoveryContractInternalServiceDiscoveryDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#InternalServiceDiscoveryContractInternalServiceDiscoveryDataModel"
		sourcePath:       "src/draft/internal-service-discovery-contract/src/internal-service-discovery.ts"
		packageName:      "internal-service-discovery-contract"
		domain:           "internal-service-discovery"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.junction-connectivity-inference-spike.junction-connectivity-inference"
		protobufMessage:  "JunctionConnectivityInferenceSpikeJunctionConnectivityInferenceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#JunctionConnectivityInferenceSpikeJunctionConnectivityInferenceDataModel"
		sourcePath:       "src/draft/junction-connectivity-inference-spike/src/junction-connectivity-inference.ts"
		packageName:      "junction-connectivity-inference-spike"
		domain:           "junction-connectivity-inference"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.junction-connectivity-plan-contract.junction-connectivity-plan"
		protobufMessage:  "JunctionConnectivityPlanContractJunctionConnectivityPlanDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#JunctionConnectivityPlanContractJunctionConnectivityPlanDataModel"
		sourcePath:       "src/draft/junction-connectivity-plan-contract/src/junction-connectivity-plan.ts"
		packageName:      "junction-connectivity-plan-contract"
		domain:           "junction-connectivity-plan"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.junction-federated-domain-contract.junction-federated-domain"
		protobufMessage:  "JunctionFederatedDomainContractJunctionFederatedDomainDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#JunctionFederatedDomainContractJunctionFederatedDomainDataModel"
		sourcePath:       "src/draft/junction-federated-domain-contract/src/junction-federated-domain.ts"
		packageName:      "junction-federated-domain-contract"
		domain:           "junction-federated-domain"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.junction-registry-federation-contract.junction-registry-federation"
		protobufMessage:  "JunctionRegistryFederationContractJunctionRegistryFederationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#JunctionRegistryFederationContractJunctionRegistryFederationDataModel"
		sourcePath:       "src/draft/junction-registry-federation-contract/src/junction-registry-federation.ts"
		packageName:      "junction-registry-federation-contract"
		domain:           "junction-registry-federation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.jwt-svid-issuance-contract.jwt-svid-issuer"
		protobufMessage:  "JwtSvidIssuanceContractJwtSvidIssuerDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#JwtSvidIssuanceContractJwtSvidIssuerDataModel"
		sourcePath:       "src/draft/jwt-svid-issuance-contract/src/jwt-svid-issuer.ts"
		packageName:      "jwt-svid-issuance-contract"
		domain:           "jwt-svid-issuance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.launch-support-escalation-matrix.launch-support-escalation"
		protobufMessage:  "LaunchSupportEscalationMatrixLaunchSupportEscalationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#LaunchSupportEscalationMatrixLaunchSupportEscalationDataModel"
		sourcePath:       "src/draft/launch-support-escalation-matrix/src/launch-support-escalation.ts"
		packageName:      "launch-support-escalation-matrix"
		domain:           "launch-support-escalation-matrix"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.lifecycle-phase-policy-contract.lifecycle-phase-policy"
		protobufMessage:  "LifecyclePhasePolicyContractLifecyclePhasePolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#LifecyclePhasePolicyContractLifecyclePhasePolicyDataModel"
		sourcePath:       "src/draft/lifecycle-phase-policy-contract/src/lifecycle-phase-policy.ts"
		packageName:      "lifecycle-phase-policy-contract"
		domain:           "lifecycle-phase-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.listing-lifecycle-yank-contract.listing-lifecycle-yank"
		protobufMessage:  "ListingLifecycleYankContractListingLifecycleYankDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ListingLifecycleYankContractListingLifecycleYankDataModel"
		sourcePath:       "src/draft/listing-lifecycle-yank-contract/src/listing-lifecycle-yank.ts"
		packageName:      "listing-lifecycle-yank-contract"
		domain:           "listing-lifecycle-yank"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.live-evals-runtime-contract.live-evals-runtime"
		protobufMessage:  "LiveEvalsRuntimeContractLiveEvalsRuntimeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#LiveEvalsRuntimeContractLiveEvalsRuntimeDataModel"
		sourcePath:       "src/draft/live-evals-runtime-contract/src/live-evals-runtime.ts"
		packageName:      "live-evals-runtime-contract"
		domain:           "live-evals-runtime"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.live-fix-gated-candidate-contract.live-fix-gated-candidate"
		protobufMessage:  "LiveFixGatedCandidateContractLiveFixGatedCandidateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#LiveFixGatedCandidateContractLiveFixGatedCandidateDataModel"
		sourcePath:       "src/draft/live-fix-gated-candidate-contract/src/live-fix-gated-candidate.ts"
		packageName:      "live-fix-gated-candidate-contract"
		domain:           "live-fix-gated-candidate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.local-dev-test-authoring-contract.local-dev-test-authoring"
		protobufMessage:  "LocalDevTestAuthoringContractLocalDevTestAuthoringDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#LocalDevTestAuthoringContractLocalDevTestAuthoringDataModel"
		sourcePath:       "src/draft/local-dev-test-authoring-contract/src/local-dev-test-authoring.ts"
		packageName:      "local-dev-test-authoring-contract"
		domain:           "local-dev-test-authoring"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.malicious-provider-containment-contract.provider-containment-contract"
		protobufMessage:  "MaliciousProviderContainmentContractProviderContainmentContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MaliciousProviderContainmentContractProviderContainmentContractDataModel"
		sourcePath:       "src/draft/malicious-provider-containment-contract/src/provider-containment-contract.ts"
		packageName:      "malicious-provider-containment-contract"
		domain:           "malicious-provider-containment"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.matching-engine-skeleton-contract.matching-engine"
		protobufMessage:  "MatchingEngineSkeletonContractMatchingEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MatchingEngineSkeletonContractMatchingEngineDataModel"
		sourcePath:       "src/draft/matching-engine-skeleton-contract/src/matching-engine.ts"
		packageName:      "matching-engine-skeleton-contract"
		domain:           "matching-engine-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.matching-specificity-vectors.matching"
		protobufMessage:  "MatchingSpecificityVectorsMatchingDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MatchingSpecificityVectorsMatchingDataModel"
		sourcePath:       "src/draft/matching-specificity-vectors/src/matching.ts"
		packageName:      "matching-specificity-vectors"
		domain:           "matching-specificity-vectors"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.materialization-subscription-contract.materialization-subscription-contract"
		protobufMessage:  "MaterializationSubscriptionContractMaterializationSubscriptionContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MaterializationSubscriptionContractMaterializationSubscriptionContractDataModel"
		sourcePath:       "src/draft/materialization-subscription-contract/src/materialization-subscription-contract.ts"
		packageName:      "materialization-subscription-contract"
		domain:           "materialization-subscription"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.mcp-server-hardening-contract.mcp-server-hardening"
		protobufMessage:  "McpServerHardeningContractMcpServerHardeningDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#McpServerHardeningContractMcpServerHardeningDataModel"
		sourcePath:       "src/draft/mcp-server-hardening-contract/src/mcp-server-hardening.ts"
		packageName:      "mcp-server-hardening-contract"
		domain:           "mcp-server-hardening"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.metering-view-projection-contract.metering-view"
		protobufMessage:  "MeteringViewProjectionContractMeteringViewDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MeteringViewProjectionContractMeteringViewDataModel"
		sourcePath:       "src/draft/metering-view-projection-contract/src/metering-view.ts"
		packageName:      "metering-view-projection-contract"
		domain:           "metering-view-projection"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.metrics-catalog-pipeline-contract.metrics-catalog-pipeline"
		protobufMessage:  "MetricsCatalogPipelineContractMetricsCatalogPipelineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MetricsCatalogPipelineContractMetricsCatalogPipelineDataModel"
		sourcePath:       "src/draft/metrics-catalog-pipeline-contract/src/metrics-catalog-pipeline.ts"
		packageName:      "metrics-catalog-pipeline-contract"
		domain:           "metrics-catalog-pipeline"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.mirror-digest-selection-contract.mirror-digest-selection"
		protobufMessage:  "MirrorDigestSelectionContractMirrorDigestSelectionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MirrorDigestSelectionContractMirrorDigestSelectionDataModel"
		sourcePath:       "src/draft/mirror-digest-selection-contract/src/mirror-digest-selection.ts"
		packageName:      "mirror-digest-selection-contract"
		domain:           "mirror-digest-selection"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.mtls-by-default-conformance-gate.mtls-by-default-conformance-gate"
		protobufMessage:  "MtlsByDefaultConformanceGateMtlsByDefaultConformanceGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MtlsByDefaultConformanceGateMtlsByDefaultConformanceGateDataModel"
		sourcePath:       "src/draft/mtls-by-default-conformance-gate/src/mtls-by-default-conformance-gate.ts"
		packageName:      "mtls-by-default-conformance-gate"
		domain:           "mtls-by-default-conformance-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.mtls-data-path-contract.mtls-data-path"
		protobufMessage:  "MtlsDataPathContractMtlsDataPathDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MtlsDataPathContractMtlsDataPathDataModel"
		sourcePath:       "src/draft/mtls-data-path-contract/src/mtls-data-path.ts"
		packageName:      "mtls-data-path-contract"
		domain:           "mtls-data-path"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.multi-cloud-shop-provider-e2e-contract.multi-cloud-shop-gate"
		protobufMessage:  "MultiCloudShopProviderE2eContractMultiCloudShopGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#MultiCloudShopProviderE2eContractMultiCloudShopGateDataModel"
		sourcePath:       "src/draft/multi-cloud-shop-provider-e2e-contract/src/multi-cloud-shop-gate.ts"
		packageName:      "multi-cloud-shop-provider-e2e-contract"
		domain:           "multi-cloud-shop-provider-e2e"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.native-log-projection-contract.native-log-projection"
		protobufMessage:  "NativeLogProjectionContractNativeLogProjectionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#NativeLogProjectionContractNativeLogProjectionDataModel"
		sourcePath:       "src/draft/native-log-projection-contract/src/native-log-projection.ts"
		packageName:      "native-log-projection-contract"
		domain:           "native-log-projection"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.no-egress-generation-sandbox-contract.contract"
		protobufMessage:  "NoEgressGenerationSandboxContractContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#NoEgressGenerationSandboxContractContractDataModel"
		sourcePath:       "src/draft/no-egress-generation-sandbox-contract/src/contract.ts"
		packageName:      "no-egress-generation-sandbox-contract"
		domain:           "no-egress-generation-sandbox"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.no-privilege-escalation-policy-contract.no-privilege-escalation-policy"
		protobufMessage:  "NoPrivilegeEscalationPolicyContractNoPrivilegeEscalationPolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#NoPrivilegeEscalationPolicyContractNoPrivilegeEscalationPolicyDataModel"
		sourcePath:       "src/draft/no-privilege-escalation-policy-contract/src/no-privilege-escalation-policy.ts"
		packageName:      "no-privilege-escalation-policy-contract"
		domain:           "no-privilege-escalation-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.non-iac-driver-adapters-contract.non-iac-driver-adapters"
		protobufMessage:  "NonIacDriverAdaptersContractNonIacDriverAdaptersDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#NonIacDriverAdaptersContractNonIacDriverAdaptersDataModel"
		sourcePath:       "src/draft/non-iac-driver-adapters-contract/src/non-iac-driver-adapters.ts"
		packageName:      "non-iac-driver-adapters-contract"
		domain:           "non-iac-driver-adapters"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.obligation-engine-contract.obligation-engine"
		protobufMessage:  "ObligationEngineContractObligationEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ObligationEngineContractObligationEngineDataModel"
		sourcePath:       "src/draft/obligation-engine-contract/src/obligation-engine.ts"
		packageName:      "obligation-engine-contract"
		domain:           "obligation-engine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.observability-cost-guard-contract.observability-cost-guard"
		protobufMessage:  "ObservabilityCostGuardContractObservabilityCostGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ObservabilityCostGuardContractObservabilityCostGuardDataModel"
		sourcePath:       "src/draft/observability-cost-guard-contract/src/observability-cost-guard.ts"
		packageName:      "observability-cost-guard-contract"
		domain:           "observability-cost-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.observed-contract-promotion-contract.observed-contract-promotion"
		protobufMessage:  "ObservedContractPromotionContractObservedContractPromotionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ObservedContractPromotionContractObservedContractPromotionDataModel"
		sourcePath:       "src/draft/observed-contract-promotion-contract/src/observed-contract-promotion.ts"
		packageName:      "observed-contract-promotion-contract"
		domain:           "observed-contract-promotion"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.oci-artifact-storage-contract.oci-artifact-storage"
		protobufMessage:  "OciArtifactStorageContractOciArtifactStorageDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OciArtifactStorageContractOciArtifactStorageDataModel"
		sourcePath:       "src/draft/oci-artifact-storage-contract/src/oci-artifact-storage.ts"
		packageName:      "oci-artifact-storage-contract"
		domain:           "oci-artifact-storage"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.offline-import-integrity-contract.offline-import-integrity"
		protobufMessage:  "OfflineImportIntegrityContractOfflineImportIntegrityDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OfflineImportIntegrityContractOfflineImportIntegrityDataModel"
		sourcePath:       "src/draft/offline-import-integrity-contract/src/offline-import-integrity.ts"
		packageName:      "offline-import-integrity-contract"
		domain:           "offline-import-integrity"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.oidc-federation-sts-contract.oidc-federation-sts"
		protobufMessage:  "OidcFederationStsContractOidcFederationStsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OidcFederationStsContractOidcFederationStsDataModel"
		sourcePath:       "src/draft/oidc-federation-sts-contract/src/oidc-federation-sts.ts"
		packageName:      "oidc-federation-sts-contract"
		domain:           "oidc-federation-sts"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.on-call-escalation-contract.on-call-escalation"
		protobufMessage:  "OnCallEscalationContractOnCallEscalationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OnCallEscalationContractOnCallEscalationDataModel"
		sourcePath:       "src/draft/on-call-escalation-contract/src/on-call-escalation.ts"
		packageName:      "on-call-escalation-contract"
		domain:           "on-call-escalation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.openexperiment-runtime-data-contract.openexperiment-runtime-data"
		protobufMessage:  "OpenexperimentRuntimeDataContractOpenexperimentRuntimeDataDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OpenexperimentRuntimeDataContractOpenexperimentRuntimeDataDataModel"
		sourcePath:       "src/draft/openexperiment-runtime-data-contract/src/openexperiment-runtime-data.ts"
		packageName:      "openexperiment-runtime-data-contract"
		domain:           "openexperiment-runtime-data"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.openfeature-provider-adapters-contract.openfeature-provider-adapters"
		protobufMessage:  "OpenfeatureProviderAdaptersContractOpenfeatureProviderAdaptersDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OpenfeatureProviderAdaptersContractOpenfeatureProviderAdaptersDataModel"
		sourcePath:       "src/draft/openfeature-provider-adapters-contract/src/openfeature-provider-adapters.ts"
		packageName:      "openfeature-provider-adapters-contract"
		domain:           "openfeature-provider-adapters"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.openinference-live-eval-stream-contract.openinference-live-eval-stream"
		protobufMessage:  "OpeninferenceLiveEvalStreamContractOpeninferenceLiveEvalStreamDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OpeninferenceLiveEvalStreamContractOpeninferenceLiveEvalStreamDataModel"
		sourcePath:       "src/draft/openinference-live-eval-stream-contract/src/openinference-live-eval-stream.ts"
		packageName:      "openinference-live-eval-stream-contract"
		domain:           "openinference-live-eval-stream"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.openinference-trajectory-capture-contract.openinference-trajectory-capture"
		protobufMessage:  "OpeninferenceTrajectoryCaptureContractOpeninferenceTrajectoryCaptureDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OpeninferenceTrajectoryCaptureContractOpeninferenceTrajectoryCaptureDataModel"
		sourcePath:       "src/draft/openinference-trajectory-capture-contract/src/openinference-trajectory-capture.ts"
		packageName:      "openinference-trajectory-capture-contract"
		domain:           "openinference-trajectory-capture"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.operations-manifests-contract.operations-manifests"
		protobufMessage:  "OperationsManifestsContractOperationsManifestsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OperationsManifestsContractOperationsManifestsDataModel"
		sourcePath:       "src/draft/operations-manifests-contract/src/operations-manifests.ts"
		packageName:      "operations-manifests-contract"
		domain:           "operations-manifests"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.operator-integration-ports-contract.operator-integration-ports"
		protobufMessage:  "OperatorIntegrationPortsContractOperatorIntegrationPortsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OperatorIntegrationPortsContractOperatorIntegrationPortsDataModel"
		sourcePath:       "src/draft/operator-integration-ports-contract/src/operator-integration-ports.ts"
		packageName:      "operator-integration-ports-contract"
		domain:           "operator-integration-ports"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.orchestrator-choreography-skeleton-contract.orchestrator-choreography"
		protobufMessage:  "OrchestratorChoreographySkeletonContractOrchestratorChoreographyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OrchestratorChoreographySkeletonContractOrchestratorChoreographyDataModel"
		sourcePath:       "src/draft/orchestrator-choreography-skeleton-contract/src/orchestrator-choreography.ts"
		packageName:      "orchestrator-choreography-skeleton-contract"
		domain:           "orchestrator-choreography-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.otel-traces-pipeline-contract.otel-traces-pipeline"
		protobufMessage:  "OtelTracesPipelineContractOtelTracesPipelineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OtelTracesPipelineContractOtelTracesPipelineDataModel"
		sourcePath:       "src/draft/otel-traces-pipeline-contract/src/otel-traces-pipeline.ts"
		packageName:      "otel-traces-pipeline-contract"
		domain:           "otel-traces-pipeline"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.outbound-xaa-token-exchange-contract.outbound-xaa-token-exchange"
		protobufMessage:  "OutboundXaaTokenExchangeContractOutboundXaaTokenExchangeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#OutboundXaaTokenExchangeContractOutboundXaaTokenExchangeDataModel"
		sourcePath:       "src/draft/outbound-xaa-token-exchange-contract/src/outbound-xaa-token-exchange.ts"
		packageName:      "outbound-xaa-token-exchange-contract"
		domain:           "outbound-xaa-token-exchange"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.paginated-query-contract.paginated-query-contract"
		protobufMessage:  "PaginatedQueryContractPaginatedQueryContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PaginatedQueryContractPaginatedQueryContractDataModel"
		sourcePath:       "src/draft/paginated-query-contract/src/paginated-query-contract.ts"
		packageName:      "paginated-query-contract"
		domain:           "paginated-query"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.paradigm-idiom-packages-contract.paradigm-idiom-packages"
		protobufMessage:  "ParadigmIdiomPackagesContractParadigmIdiomPackagesDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ParadigmIdiomPackagesContractParadigmIdiomPackagesDataModel"
		sourcePath:       "src/draft/paradigm-idiom-packages-contract/src/paradigm-idiom-packages.ts"
		packageName:      "paradigm-idiom-packages-contract"
		domain:           "paradigm-idiom-packages"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.partial-realize-rollback-contract.partial-realize-rollback"
		protobufMessage:  "PartialRealizeRollbackContractPartialRealizeRollbackDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PartialRealizeRollbackContractPartialRealizeRollbackDataModel"
		sourcePath:       "src/draft/partial-realize-rollback-contract/src/partial-realize-rollback.ts"
		packageName:      "partial-realize-rollback-contract"
		domain:           "partial-realize-rollback"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.per-app-tenant-routing-contract.per-app-tenant-routing"
		protobufMessage:  "PerAppTenantRoutingContractPerAppTenantRoutingDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PerAppTenantRoutingContractPerAppTenantRoutingDataModel"
		sourcePath:       "src/draft/per-app-tenant-routing-contract/src/per-app-tenant-routing.ts"
		packageName:      "per-app-tenant-routing-contract"
		domain:           "per-app-tenant-routing"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.planner-dag-skeleton-contract.planner"
		protobufMessage:  "PlannerDagSkeletonContractPlannerDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PlannerDagSkeletonContractPlannerDataModel"
		sourcePath:       "src/draft/planner-dag-skeleton-contract/src/planner.ts"
		packageName:      "planner-dag-skeleton-contract"
		domain:           "planner-dag-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.platform-engineer-flow-contract.platform-engineer-flow"
		protobufMessage:  "PlatformEngineerFlowContractPlatformEngineerFlowDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PlatformEngineerFlowContractPlatformEngineerFlowDataModel"
		sourcePath:       "src/draft/platform-engineer-flow-contract/src/platform-engineer-flow.ts"
		packageName:      "platform-engineer-flow-contract"
		domain:           "platform-engineer-flow"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.poison-event-quarantine-contract.poison-event-quarantine"
		protobufMessage:  "PoisonEventQuarantineContractPoisonEventQuarantineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PoisonEventQuarantineContractPoisonEventQuarantineDataModel"
		sourcePath:       "src/draft/poison-event-quarantine-contract/src/poison-event-quarantine.ts"
		packageName:      "poison-event-quarantine-contract"
		domain:           "poison-event-quarantine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.policy-audit-export-contract.policy-audit-export"
		protobufMessage:  "PolicyAuditExportContractPolicyAuditExportDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PolicyAuditExportContractPolicyAuditExportDataModel"
		sourcePath:       "src/draft/policy-audit-export-contract/src/policy-audit-export.ts"
		packageName:      "policy-audit-export-contract"
		domain:           "policy-audit-export"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.policy-authoring-waiver-contract.policy-authoring-waiver"
		protobufMessage:  "PolicyAuthoringWaiverContractPolicyAuthoringWaiverDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PolicyAuthoringWaiverContractPolicyAuthoringWaiverDataModel"
		sourcePath:       "src/draft/policy-authoring-waiver-contract/src/policy-authoring-waiver.ts"
		packageName:      "policy-authoring-waiver-contract"
		domain:           "policy-authoring-waiver"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.policy-engine-port-contract.policy-engine-port"
		protobufMessage:  "PolicyEnginePortContractPolicyEnginePortDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PolicyEnginePortContractPolicyEnginePortDataModel"
		sourcePath:       "src/draft/policy-engine-port-contract/src/policy-engine-port.ts"
		packageName:      "policy-engine-port-contract"
		domain:           "policy-engine-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.policy-engine-provider-adapters-contract.policy-engine-provider-adapters"
		protobufMessage:  "PolicyEngineProviderAdaptersContractPolicyEngineProviderAdaptersDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PolicyEngineProviderAdaptersContractPolicyEngineProviderAdaptersDataModel"
		sourcePath:       "src/draft/policy-engine-provider-adapters-contract/src/policy-engine-provider-adapters.ts"
		packageName:      "policy-engine-provider-adapters-contract"
		domain:           "policy-engine-provider-adapters"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.policy-fail-closed-contract.policy-fail-closed"
		protobufMessage:  "PolicyFailClosedContractPolicyFailClosedDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PolicyFailClosedContractPolicyFailClosedDataModel"
		sourcePath:       "src/draft/policy-fail-closed-contract/src/policy-fail-closed.ts"
		packageName:      "policy-fail-closed-contract"
		domain:           "policy-fail-closed"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.policy-gated-flag-flips-contract.policy-gated-flag-flips"
		protobufMessage:  "PolicyGatedFlagFlipsContractPolicyGatedFlagFlipsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PolicyGatedFlagFlipsContractPolicyGatedFlagFlipsDataModel"
		sourcePath:       "src/draft/policy-gated-flag-flips-contract/src/policy-gated-flag-flips.ts"
		packageName:      "policy-gated-flag-flips-contract"
		domain:           "policy-gated-flag-flips"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.policy-pack-federation-contract.policy-pack-federation"
		protobufMessage:  "PolicyPackFederationContractPolicyPackFederationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PolicyPackFederationContractPolicyPackFederationDataModel"
		sourcePath:       "src/draft/policy-pack-federation-contract/src/policy-pack-federation.ts"
		packageName:      "policy-pack-federation-contract"
		domain:           "policy-pack-federation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.policy-supply-chain-trust-contract.policy-supply-chain-trust"
		protobufMessage:  "PolicySupplyChainTrustContractPolicySupplyChainTrustDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PolicySupplyChainTrustContractPolicySupplyChainTrustDataModel"
		sourcePath:       "src/draft/policy-supply-chain-trust-contract/src/policy-supply-chain-trust.ts"
		packageName:      "policy-supply-chain-trust-contract"
		domain:           "policy-supply-chain-trust"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.portability-report-contract.portability-report-contract"
		protobufMessage:  "PortabilityReportContractPortabilityReportContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PortabilityReportContractPortabilityReportContractDataModel"
		sourcePath:       "src/draft/portability-report-contract/src/portability-report-contract.ts"
		packageName:      "portability-report-contract"
		domain:           "portability-report"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.portability-swap-equivalent-contract.portability-swap-equivalent"
		protobufMessage:  "PortabilitySwapEquivalentContractPortabilitySwapEquivalentDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PortabilitySwapEquivalentContractPortabilitySwapEquivalentDataModel"
		sourcePath:       "src/draft/portability-swap-equivalent-contract/src/portability-swap-equivalent.ts"
		packageName:      "portability-swap-equivalent-contract"
		domain:           "portability-swap-equivalent"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.pre-launch-outcome-contract.pre-launch-outcome"
		protobufMessage:  "PreLaunchOutcomeContractPreLaunchOutcomeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PreLaunchOutcomeContractPreLaunchOutcomeDataModel"
		sourcePath:       "src/draft/pre-launch-outcome-contract/src/pre-launch-outcome.ts"
		packageName:      "pre-launch-outcome-contract"
		domain:           "pre-launch-outcome"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.preview-ephemeral-environments-contract.preview-environments"
		protobufMessage:  "PreviewEphemeralEnvironmentsContractPreviewEnvironmentsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#PreviewEphemeralEnvironmentsContractPreviewEnvironmentsDataModel"
		sourcePath:       "src/draft/preview-ephemeral-environments-contract/src/preview-environments.ts"
		packageName:      "preview-ephemeral-environments-contract"
		domain:           "preview-ephemeral-environments"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.projection-consistency-reactivity-contract.projection-contract"
		protobufMessage:  "ProjectionConsistencyReactivityContractProjectionContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProjectionConsistencyReactivityContractProjectionContractDataModel"
		sourcePath:       "src/draft/projection-consistency-reactivity-contract/src/projection-contract.ts"
		packageName:      "projection-consistency-reactivity-contract"
		domain:           "projection-consistency-reactivity"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.projection-lag-consistency-contract.projection-lag-consistency"
		protobufMessage:  "ProjectionLagConsistencyContractProjectionLagConsistencyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProjectionLagConsistencyContractProjectionLagConsistencyDataModel"
		sourcePath:       "src/draft/projection-lag-consistency-contract/src/projection-lag-consistency.ts"
		packageName:      "projection-lag-consistency-contract"
		domain:           "projection-lag-consistency"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.projection-rebuild-contract.projection-rebuild-contract"
		protobufMessage:  "ProjectionRebuildContractProjectionRebuildContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProjectionRebuildContractProjectionRebuildContractDataModel"
		sourcePath:       "src/draft/projection-rebuild-contract/src/projection-rebuild-contract.ts"
		packageName:      "projection-rebuild-contract"
		domain:           "projection-rebuild"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.projection-sink-change-feed-conformance-contract.change-feed-conformance"
		protobufMessage:  "ProjectionSinkChangeFeedConformanceContractChangeFeedConformanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProjectionSinkChangeFeedConformanceContractChangeFeedConformanceDataModel"
		sourcePath:       "src/draft/projection-sink-change-feed-conformance-contract/src/change-feed-conformance.ts"
		packageName:      "projection-sink-change-feed-conformance-contract"
		domain:           "projection-sink-change-feed-conformance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-authoring-contract.provider-authoring-contract"
		protobufMessage:  "ProviderAuthoringContractProviderAuthoringContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderAuthoringContractProviderAuthoringContractDataModel"
		sourcePath:       "src/draft/provider-authoring-contract/src/provider-authoring-contract.ts"
		packageName:      "provider-authoring-contract"
		domain:           "provider-authoring"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-aws-contract.provider-aws"
		protobufMessage:  "ProviderAwsContractProviderAwsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderAwsContractProviderAwsDataModel"
		sourcePath:       "src/draft/provider-aws-contract/src/provider-aws.ts"
		packageName:      "provider-aws-contract"
		domain:           "provider-aws"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-azure-contract.provider-azure"
		protobufMessage:  "ProviderAzureContractProviderAzureDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderAzureContractProviderAzureDataModel"
		sourcePath:       "src/draft/provider-azure-contract/src/provider-azure.ts"
		packageName:      "provider-azure-contract"
		domain:           "provider-azure"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-capability-conformance-suites.provider-capability-conformance"
		protobufMessage:  "ProviderCapabilityConformanceSuitesProviderCapabilityConformanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderCapabilityConformanceSuitesProviderCapabilityConformanceDataModel"
		sourcePath:       "src/draft/provider-capability-conformance-suites/src/provider-capability-conformance.ts"
		packageName:      "provider-capability-conformance-suites"
		domain:           "provider-capability-conformance-suites"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-capability-manifest-contract.provider-capability-manifest"
		protobufMessage:  "ProviderCapabilityManifestContractProviderCapabilityManifestDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderCapabilityManifestContractProviderCapabilityManifestDataModel"
		sourcePath:       "src/draft/provider-capability-manifest-contract/src/provider-capability-manifest.ts"
		packageName:      "provider-capability-manifest-contract"
		domain:           "provider-capability-manifest"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-cloudflare-contract.provider-cloudflare"
		protobufMessage:  "ProviderCloudflareContractProviderCloudflareDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderCloudflareContractProviderCloudflareDataModel"
		sourcePath:       "src/draft/provider-cloudflare-contract/src/provider-cloudflare.ts"
		packageName:      "provider-cloudflare-contract"
		domain:           "provider-cloudflare"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-default-definitions-contract.provider-default-definitions"
		protobufMessage:  "ProviderDefaultDefinitionsContractProviderDefaultDefinitionsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderDefaultDefinitionsContractProviderDefaultDefinitionsDataModel"
		sourcePath:       "src/draft/provider-default-definitions-contract/src/provider-default-definitions.ts"
		packageName:      "provider-default-definitions-contract"
		domain:           "provider-default-definitions"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-fly-contract.provider-fly-contract"
		protobufMessage:  "ProviderFlyContractProviderFlyContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderFlyContractProviderFlyContractDataModel"
		sourcePath:       "src/draft/provider-fly-contract/src/provider-fly-contract.ts"
		packageName:      "provider-fly-contract"
		domain:           "provider-fly"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-gcp-contract.provider-gcp"
		protobufMessage:  "ProviderGcpContractProviderGcpDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderGcpContractProviderGcpDataModel"
		sourcePath:       "src/draft/provider-gcp-contract/src/provider-gcp.ts"
		packageName:      "provider-gcp-contract"
		domain:           "provider-gcp"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-hetzner-contract.provider-hetzner"
		protobufMessage:  "ProviderHetznerContractProviderHetznerDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderHetznerContractProviderHetznerDataModel"
		sourcePath:       "src/draft/provider-hetzner-contract/src/provider-hetzner.ts"
		packageName:      "provider-hetzner-contract"
		domain:           "provider-hetzner"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-kubernetes-contract.provider-kubernetes"
		protobufMessage:  "ProviderKubernetesContractProviderKubernetesDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderKubernetesContractProviderKubernetesDataModel"
		sourcePath:       "src/draft/provider-kubernetes-contract/src/provider-kubernetes.ts"
		packageName:      "provider-kubernetes-contract"
		domain:           "provider-kubernetes"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-local-zero-infra.provider-local"
		protobufMessage:  "ProviderLocalZeroInfraProviderLocalDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderLocalZeroInfraProviderLocalDataModel"
		sourcePath:       "src/draft/provider-local-zero-infra/src/provider-local.ts"
		packageName:      "provider-local-zero-infra"
		domain:           "provider-local-zero-infra"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-options-pattern-contract.provider-options-contract"
		protobufMessage:  "ProviderOptionsPatternContractProviderOptionsContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderOptionsPatternContractProviderOptionsContractDataModel"
		sourcePath:       "src/draft/provider-options-pattern-contract/src/provider-options-contract.ts"
		packageName:      "provider-options-pattern-contract"
		domain:           "provider-options-pattern"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-port-contract.provider-ports"
		protobufMessage:  "ProviderPortContractProviderPortsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderPortContractProviderPortsDataModel"
		sourcePath:       "src/draft/provider-port-contract/src/provider-ports.ts"
		packageName:      "provider-port-contract"
		domain:           "provider-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.provider-vercel-contract.provider-vercel"
		protobufMessage:  "ProviderVercelContractProviderVercelDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ProviderVercelContractProviderVercelDataModel"
		sourcePath:       "src/draft/provider-vercel-contract/src/provider-vercel.ts"
		packageName:      "provider-vercel-contract"
		domain:           "provider-vercel"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.queue-clock-runtime-port-contract.queue-clock-runtime-port"
		protobufMessage:  "QueueClockRuntimePortContractQueueClockRuntimePortDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#QueueClockRuntimePortContractQueueClockRuntimePortDataModel"
		sourcePath:       "src/draft/queue-clock-runtime-port-contract/src/queue-clock-runtime-port.ts"
		packageName:      "queue-clock-runtime-port-contract"
		domain:           "queue-clock-runtime-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.raw-driver-escape-hatch-contract.raw-driver-escape-hatch"
		protobufMessage:  "RawDriverEscapeHatchContractRawDriverEscapeHatchDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RawDriverEscapeHatchContractRawDriverEscapeHatchDataModel"
		sourcePath:       "src/draft/raw-driver-escape-hatch-contract/src/raw-driver-escape-hatch.ts"
		packageName:      "raw-driver-escape-hatch-contract"
		domain:           "raw-driver-escape-hatch"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.rbac-role-binding-contract.rbac-role-binding"
		protobufMessage:  "RbacRoleBindingContractRbacRoleBindingDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RbacRoleBindingContractRbacRoleBindingDataModel"
		sourcePath:       "src/draft/rbac-role-binding-contract/src/rbac-role-binding.ts"
		packageName:      "rbac-role-binding-contract"
		domain:           "rbac-role-binding"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.reactor-coalescing-fanout-contract.reactor-coalescing-fanout"
		protobufMessage:  "ReactorCoalescingFanoutContractReactorCoalescingFanoutDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ReactorCoalescingFanoutContractReactorCoalescingFanoutDataModel"
		sourcePath:       "src/draft/reactor-coalescing-fanout-contract/src/reactor-coalescing-fanout.ts"
		packageName:      "reactor-coalescing-fanout-contract"
		domain:           "reactor-coalescing-fanout"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.reactor-skeleton-contract.reactor-skeleton-contract"
		protobufMessage:  "ReactorSkeletonContractReactorSkeletonContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ReactorSkeletonContractReactorSkeletonContractDataModel"
		sourcePath:       "src/draft/reactor-skeleton-contract/src/reactor-skeleton-contract.ts"
		packageName:      "reactor-skeleton-contract"
		domain:           "reactor-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.reads-your-writes-contract.reads-your-writes-contract"
		protobufMessage:  "ReadsYourWritesContractReadsYourWritesContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ReadsYourWritesContractReadsYourWritesContractDataModel"
		sourcePath:       "src/draft/reads-your-writes-contract/src/reads-your-writes-contract.ts"
		packageName:      "reads-your-writes-contract"
		domain:           "reads-your-writes"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.region-objective-ranking-contract.region-objective-ranking"
		protobufMessage:  "RegionObjectiveRankingContractRegionObjectiveRankingDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RegionObjectiveRankingContractRegionObjectiveRankingDataModel"
		sourcePath:       "src/draft/region-objective-ranking-contract/src/region-objective-ranking.ts"
		packageName:      "region-objective-ranking-contract"
		domain:           "region-objective-ranking"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.registry-artifact-descriptor-contract.registry-descriptor"
		protobufMessage:  "RegistryArtifactDescriptorContractRegistryDescriptorDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RegistryArtifactDescriptorContractRegistryDescriptorDataModel"
		sourcePath:       "src/draft/registry-artifact-descriptor-contract/src/registry-descriptor.ts"
		packageName:      "registry-artifact-descriptor-contract"
		domain:           "registry-artifact-descriptor"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.registry-compromise-guard-contract.registry-compromise-guard"
		protobufMessage:  "RegistryCompromiseGuardContractRegistryCompromiseGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RegistryCompromiseGuardContractRegistryCompromiseGuardDataModel"
		sourcePath:       "src/draft/registry-compromise-guard-contract/src/registry-compromise-guard.ts"
		packageName:      "registry-compromise-guard-contract"
		domain:           "registry-compromise-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.registry-dependency-confusion-guard-contract.registry-dependency-confusion-guard"
		protobufMessage:  "RegistryDependencyConfusionGuardContractRegistryDependencyConfusionGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RegistryDependencyConfusionGuardContractRegistryDependencyConfusionGuardDataModel"
		sourcePath:       "src/draft/registry-dependency-confusion-guard-contract/src/registry-dependency-confusion-guard.ts"
		packageName:      "registry-dependency-confusion-guard-contract"
		domain:           "registry-dependency-confusion-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.registry-import-contract.registry-import"
		protobufMessage:  "RegistryImportContractRegistryImportDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RegistryImportContractRegistryImportDataModel"
		sourcePath:       "src/draft/registry-import-contract/src/registry-import.ts"
		packageName:      "registry-import-contract"
		domain:           "registry-import"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.registry-publish-flow-contract.registry-publish-flow"
		protobufMessage:  "RegistryPublishFlowContractRegistryPublishFlowDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RegistryPublishFlowContractRegistryPublishFlowDataModel"
		sourcePath:       "src/draft/registry-publish-flow-contract/src/registry-publish-flow.ts"
		packageName:      "registry-publish-flow-contract"
		domain:           "registry-publish-flow"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.relational-projection-sink-contract.relational-projection-sink"
		protobufMessage:  "RelationalProjectionSinkContractRelationalProjectionSinkDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RelationalProjectionSinkContractRelationalProjectionSinkDataModel"
		sourcePath:       "src/draft/relational-projection-sink-contract/src/relational-projection-sink.ts"
		packageName:      "relational-projection-sink-contract"
		domain:           "relational-projection-sink"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.reliability-sla-rollup-contract.reliability-sla-rollup"
		protobufMessage:  "ReliabilitySlaRollupContractReliabilitySlaRollupDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ReliabilitySlaRollupContractReliabilitySlaRollupDataModel"
		sourcePath:       "src/draft/reliability-sla-rollup-contract/src/reliability-sla-rollup.ts"
		packageName:      "reliability-sla-rollup-contract"
		domain:           "reliability-sla-rollup"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.remediation-safety-gate-contract.remediation-safety-gate"
		protobufMessage:  "RemediationSafetyGateContractRemediationSafetyGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RemediationSafetyGateContractRemediationSafetyGateDataModel"
		sourcePath:       "src/draft/remediation-safety-gate-contract/src/remediation-safety-gate.ts"
		packageName:      "remediation-safety-gate-contract"
		domain:           "remediation-safety-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.replay-live-equivalence-poc.equivalence"
		protobufMessage:  "ReplayLiveEquivalencePocEquivalenceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ReplayLiveEquivalencePocEquivalenceDataModel"
		sourcePath:       "src/draft/replay-live-equivalence-poc/src/equivalence.ts"
		packageName:      "replay-live-equivalence-poc"
		domain:           "replay-live-equivalence"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.repo-view-escape-hatches-contract.repo-view-escape-hatches"
		protobufMessage:  "RepoViewEscapeHatchesContractRepoViewEscapeHatchesDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RepoViewEscapeHatchesContractRepoViewEscapeHatchesDataModel"
		sourcePath:       "src/draft/repo-view-escape-hatches-contract/src/repo-view-escape-hatches.ts"
		packageName:      "repo-view-escape-hatches-contract"
		domain:           "repo-view-escape-hatches"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.resource-collection-engine-contract.resource-collection-engine"
		protobufMessage:  "ResourceCollectionEngineContractResourceCollectionEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ResourceCollectionEngineContractResourceCollectionEngineDataModel"
		sourcePath:       "src/draft/resource-collection-engine-contract/src/resource-collection-engine.ts"
		packageName:      "resource-collection-engine-contract"
		domain:           "resource-collection-engine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.resource-definition-driver-contract.resource-definition-driver-contract"
		protobufMessage:  "ResourceDefinitionDriverContractResourceDefinitionDriverContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ResourceDefinitionDriverContractResourceDefinitionDriverContractDataModel"
		sourcePath:       "src/draft/resource-definition-driver-contract/src/resource-definition-driver-contract.ts"
		packageName:      "resource-definition-driver-contract"
		domain:           "resource-definition-driver"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.resource-pack-distribution-contract.resource-pack-distribution"
		protobufMessage:  "ResourcePackDistributionContractResourcePackDistributionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ResourcePackDistributionContractResourcePackDistributionDataModel"
		sourcePath:       "src/draft/resource-pack-distribution-contract/src/resource-pack-distribution.ts"
		packageName:      "resource-pack-distribution-contract"
		domain:           "resource-pack-distribution"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.resourceactor-fsm-contract.resourceactor-fsm-contract"
		protobufMessage:  "ResourceactorFsmContractResourceactorFsmContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ResourceactorFsmContractResourceactorFsmContractDataModel"
		sourcePath:       "src/draft/resourceactor-fsm-contract/src/resourceactor-fsm-contract.ts"
		packageName:      "resourceactor-fsm-contract"
		domain:           "resourceactor-fsm"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.resourceactor-reconcile-loop-contract.resourceactor-reconcile-loop"
		protobufMessage:  "ResourceactorReconcileLoopContractResourceactorReconcileLoopDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ResourceactorReconcileLoopContractResourceactorReconcileLoopDataModel"
		sourcePath:       "src/draft/resourceactor-reconcile-loop-contract/src/resourceactor-reconcile-loop.ts"
		packageName:      "resourceactor-reconcile-loop-contract"
		domain:           "resourceactor-reconcile-loop"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.rollback-failure-compensation-contract.rollback-failure-compensation"
		protobufMessage:  "RollbackFailureCompensationContractRollbackFailureCompensationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RollbackFailureCompensationContractRollbackFailureCompensationDataModel"
		sourcePath:       "src/draft/rollback-failure-compensation-contract/src/rollback-failure-compensation.ts"
		packageName:      "rollback-failure-compensation-contract"
		domain:           "rollback-failure-compensation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.run-inspector-projection-contract.run-inspector"
		protobufMessage:  "RunInspectorProjectionContractRunInspectorDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RunInspectorProjectionContractRunInspectorDataModel"
		sourcePath:       "src/draft/run-inspector-projection-contract/src/run-inspector.ts"
		packageName:      "run-inspector-projection-contract"
		domain:           "run-inspector-projection"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.runaway-remediation-guard-contract.runaway-remediation-guard"
		protobufMessage:  "RunawayRemediationGuardContractRunawayRemediationGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RunawayRemediationGuardContractRunawayRemediationGuardDataModel"
		sourcePath:       "src/draft/runaway-remediation-guard-contract/src/runaway-remediation-guard.ts"
		packageName:      "runaway-remediation-guard-contract"
		domain:           "runaway-remediation-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.runaway-spend-circuit-breaker-contract.runaway-spend-circuit-breaker"
		protobufMessage:  "RunawaySpendCircuitBreakerContractRunawaySpendCircuitBreakerDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RunawaySpendCircuitBreakerContractRunawaySpendCircuitBreakerDataModel"
		sourcePath:       "src/draft/runaway-spend-circuit-breaker-contract/src/runaway-spend-circuit-breaker.ts"
		packageName:      "runaway-spend-circuit-breaker-contract"
		domain:           "runaway-spend-circuit-breaker"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.runbook-contract.runbook-contract"
		protobufMessage:  "RunbookContractRunbookContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RunbookContractRunbookContractDataModel"
		sourcePath:       "src/draft/runbook-contract/src/runbook-contract.ts"
		packageName:      "runbook-contract"
		domain:           "runbook"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.runbook-execution-engine-contract.runbook-execution-engine"
		protobufMessage:  "RunbookExecutionEngineContractRunbookExecutionEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RunbookExecutionEngineContractRunbookExecutionEngineDataModel"
		sourcePath:       "src/draft/runbook-execution-engine-contract/src/runbook-execution-engine.ts"
		packageName:      "runbook-execution-engine-contract"
		domain:           "runbook-execution-engine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.runtime-local-component-host.component-host"
		protobufMessage:  "RuntimeLocalComponentHostComponentHostDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RuntimeLocalComponentHostComponentHostDataModel"
		sourcePath:       "src/draft/runtime-local-component-host/src/component-host.ts"
		packageName:      "runtime-local-component-host"
		domain:           "runtime-local-component-host"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.runtime-local-execution-limits-contract.execution-limits"
		protobufMessage:  "RuntimeLocalExecutionLimitsContractExecutionLimitsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RuntimeLocalExecutionLimitsContractExecutionLimitsDataModel"
		sourcePath:       "src/draft/runtime-local-execution-limits-contract/src/execution-limits.ts"
		packageName:      "runtime-local-execution-limits-contract"
		domain:           "runtime-local-execution-limits"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.runtime-port-conformance-contract.runtime-port-conformance"
		protobufMessage:  "RuntimePortConformanceContractRuntimePortConformanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#RuntimePortConformanceContractRuntimePortConformanceDataModel"
		sourcePath:       "src/draft/runtime-port-conformance-contract/src/runtime-port-conformance.ts"
		packageName:      "runtime-port-conformance-contract"
		domain:           "runtime-port-conformance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.saga-compensation-engine-contract.saga-compensation-engine"
		protobufMessage:  "SagaCompensationEngineContractSagaCompensationEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SagaCompensationEngineContractSagaCompensationEngineDataModel"
		sourcePath:       "src/draft/saga-compensation-engine-contract/src/saga-compensation-engine.ts"
		packageName:      "saga-compensation-engine-contract"
		domain:           "saga-compensation-engine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.saga-credit-reconciliation-spike.spike"
		protobufMessage:  "SagaCreditReconciliationSpikeSpikeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SagaCreditReconciliationSpikeSpikeDataModel"
		sourcePath:       "src/draft/saga-credit-reconciliation-spike/src/spike.ts"
		packageName:      "saga-credit-reconciliation-spike"
		domain:           "saga-credit-reconciliation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.sdk-codegen-surface-contract.sdk-codegen-surface"
		protobufMessage:  "SdkCodegenSurfaceContractSdkCodegenSurfaceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SdkCodegenSurfaceContractSdkCodegenSurfaceDataModel"
		sourcePath:       "src/draft/sdk-codegen-surface-contract/src/sdk-codegen-surface.ts"
		packageName:      "sdk-codegen-surface-contract"
		domain:           "sdk-codegen-surface"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.sdk-flag-surface-contract.sdk-flag-surface"
		protobufMessage:  "SdkFlagSurfaceContractSdkFlagSurfaceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SdkFlagSurfaceContractSdkFlagSurfaceDataModel"
		sourcePath:       "src/draft/sdk-flag-surface-contract/src/sdk-flag-surface.ts"
		packageName:      "sdk-flag-surface-contract"
		domain:           "sdk-flag-surface"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.sdk-idiom-conformance-gate.sdk-conformance-gate"
		protobufMessage:  "SdkIdiomConformanceGateSdkConformanceGateDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SdkIdiomConformanceGateSdkConformanceGateDataModel"
		sourcePath:       "src/draft/sdk-idiom-conformance-gate/src/sdk-conformance-gate.ts"
		packageName:      "sdk-idiom-conformance-gate"
		domain:           "sdk-idiom-conformance-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.search-extension-packages-contract.search-extension-packages"
		protobufMessage:  "SearchExtensionPackagesContractSearchExtensionPackagesDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SearchExtensionPackagesContractSearchExtensionPackagesDataModel"
		sourcePath:       "src/draft/search-extension-packages-contract/src/search-extension-packages.ts"
		packageName:      "search-extension-packages-contract"
		domain:           "search-extension-packages"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.secops-policy-audit-journey-contract.secops-policy-audit-journey"
		protobufMessage:  "SecopsPolicyAuditJourneyContractSecopsPolicyAuditJourneyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SecopsPolicyAuditJourneyContractSecopsPolicyAuditJourneyDataModel"
		sourcePath:       "src/draft/secops-policy-audit-journey-contract/src/secops-policy-audit-journey.ts"
		packageName:      "secops-policy-audit-journey-contract"
		domain:           "secops-policy-audit-journey"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.secret-zero-genesis-bootstrap-contract.genesis-bootstrap-trust"
		protobufMessage:  "SecretZeroGenesisBootstrapContractGenesisBootstrapTrustDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SecretZeroGenesisBootstrapContractGenesisBootstrapTrustDataModel"
		sourcePath:       "src/draft/secret-zero-genesis-bootstrap-contract/src/genesis-bootstrap-trust.ts"
		packageName:      "secret-zero-genesis-bootstrap-contract"
		domain:           "secret-zero-genesis-bootstrap"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.secretless-config-resolution-contract.secretless-config-resolution"
		protobufMessage:  "SecretlessConfigResolutionContractSecretlessConfigResolutionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SecretlessConfigResolutionContractSecretlessConfigResolutionDataModel"
		sourcePath:       "src/draft/secretless-config-resolution-contract/src/secretless-config-resolution.ts"
		packageName:      "secretless-config-resolution-contract"
		domain:           "secretless-config-resolution"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.self-host-bootstrap-ordering-spike.bootstrap-ordering"
		protobufMessage:  "SelfHostBootstrapOrderingSpikeBootstrapOrderingDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SelfHostBootstrapOrderingSpikeBootstrapOrderingDataModel"
		sourcePath:       "src/draft/self-host-bootstrap-ordering-spike/src/bootstrap-ordering.ts"
		packageName:      "self-host-bootstrap-ordering-spike"
		domain:           "self-host-bootstrap-ordering"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.self-host-bootstrap-saga-contract.self-host-bootstrap-saga"
		protobufMessage:  "SelfHostBootstrapSagaContractSelfHostBootstrapSagaDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SelfHostBootstrapSagaContractSelfHostBootstrapSagaDataModel"
		sourcePath:       "src/draft/self-host-bootstrap-saga-contract/src/self-host-bootstrap-saga.ts"
		packageName:      "self-host-bootstrap-saga-contract"
		domain:           "self-host-bootstrap-saga"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.session-revocation-contract.session-revocation"
		protobufMessage:  "SessionRevocationContractSessionRevocationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SessionRevocationContractSessionRevocationDataModel"
		sourcePath:       "src/draft/session-revocation-contract/src/session-revocation.ts"
		packageName:      "session-revocation-contract"
		domain:           "session-revocation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.shared-cost-attribution-contract.shared-cost-attribution"
		protobufMessage:  "SharedCostAttributionContractSharedCostAttributionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SharedCostAttributionContractSharedCostAttributionDataModel"
		sourcePath:       "src/draft/shared-cost-attribution-contract/src/shared-cost-attribution.ts"
		packageName:      "shared-cost-attribution-contract"
		domain:           "shared-cost-attribution"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.showback-attribution-contract.showback-attribution"
		protobufMessage:  "ShowbackAttributionContractShowbackAttributionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#ShowbackAttributionContractShowbackAttributionDataModel"
		sourcePath:       "src/draft/showback-attribution-contract/src/showback-attribution.ts"
		packageName:      "showback-attribution-contract"
		domain:           "showback-attribution"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.signed-artifact-publish-install-contract.publish-install-contract"
		protobufMessage:  "SignedArtifactPublishInstallContractPublishInstallContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SignedArtifactPublishInstallContractPublishInstallContractDataModel"
		sourcePath:       "src/draft/signed-artifact-publish-install-contract/src/publish-install-contract.ts"
		packageName:      "signed-artifact-publish-install-contract"
		domain:           "signed-artifact-publish-install"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.signed-offline-bundle-contract.bundle-contract"
		protobufMessage:  "SignedOfflineBundleContractBundleContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SignedOfflineBundleContractBundleContractDataModel"
		sourcePath:       "src/draft/signed-offline-bundle-contract/src/bundle-contract.ts"
		packageName:      "signed-offline-bundle-contract"
		domain:           "signed-offline-bundle"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.slo-as-code-contract.slo-contract"
		protobufMessage:  "SloAsCodeContractSloContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SloAsCodeContractSloContractDataModel"
		sourcePath:       "src/draft/slo-as-code-contract/src/slo-contract.ts"
		packageName:      "slo-as-code-contract"
		domain:           "slo-as-code"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.slo-computation-engine-contract.slo-computation-engine"
		protobufMessage:  "SloComputationEngineContractSloComputationEngineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SloComputationEngineContractSloComputationEngineDataModel"
		sourcePath:       "src/draft/slo-computation-engine-contract/src/slo-computation-engine.ts"
		packageName:      "slo-computation-engine-contract"
		domain:           "slo-computation-engine"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.slo-gaming-guard-contract.slo-gaming-guard-contract"
		protobufMessage:  "SloGamingGuardContractSloGamingGuardContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SloGamingGuardContractSloGamingGuardContractDataModel"
		sourcePath:       "src/draft/slo-gaming-guard-contract/src/slo-gaming-guard-contract.ts"
		packageName:      "slo-gaming-guard-contract"
		domain:           "slo-gaming-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.slo-gated-rollback-analysis-contract.slo-gated-rollback-analysis"
		protobufMessage:  "SloGatedRollbackAnalysisContractSloGatedRollbackAnalysisDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SloGatedRollbackAnalysisContractSloGatedRollbackAnalysisDataModel"
		sourcePath:       "src/draft/slo-gated-rollback-analysis-contract/src/slo-gated-rollback-analysis.ts"
		packageName:      "slo-gated-rollback-analysis-contract"
		domain:           "slo-gated-rollback-analysis"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.slo-promotion-gate-contract.slo-promotion-gate-contract"
		protobufMessage:  "SloPromotionGateContractSloPromotionGateContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SloPromotionGateContractSloPromotionGateContractDataModel"
		sourcePath:       "src/draft/slo-promotion-gate-contract/src/slo-promotion-gate-contract.ts"
		packageName:      "slo-promotion-gate-contract"
		domain:           "slo-promotion-gate"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.slo-rollback-decision-correctness-spike.replay-corpus"
		protobufMessage:  "SloRollbackDecisionCorrectnessSpikeReplayCorpusDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SloRollbackDecisionCorrectnessSpikeReplayCorpusDataModel"
		sourcePath:       "src/draft/slo-rollback-decision-correctness-spike/src/replay-corpus.ts"
		packageName:      "slo-rollback-decision-correctness-spike"
		domain:           "slo-rollback-decision-correctness"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.slsa-provenance-certification-contract.provenance"
		protobufMessage:  "SlsaProvenanceCertificationContractProvenanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SlsaProvenanceCertificationContractProvenanceDataModel"
		sourcePath:       "src/draft/slsa-provenance-certification-contract/src/provenance.ts"
		packageName:      "slsa-provenance-certification-contract"
		domain:           "slsa-provenance-certification"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.snapshot-compaction-contract.snapshot-compaction-contract"
		protobufMessage:  "SnapshotCompactionContractSnapshotCompactionContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SnapshotCompactionContractSnapshotCompactionContractDataModel"
		sourcePath:       "src/draft/snapshot-compaction-contract/src/snapshot-compaction-contract.ts"
		packageName:      "snapshot-compaction-contract"
		domain:           "snapshot-compaction"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.snapshot-replay-divergence-contract.snapshot-replay-divergence-contract"
		protobufMessage:  "SnapshotReplayDivergenceContractSnapshotReplayDivergenceContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SnapshotReplayDivergenceContractSnapshotReplayDivergenceContractDataModel"
		sourcePath:       "src/draft/snapshot-replay-divergence-contract/src/snapshot-replay-divergence-contract.ts"
		packageName:      "snapshot-replay-divergence-contract"
		domain:           "snapshot-replay-divergence"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.split-horizon-partition-connectivity-contract.split-horizon-partition-connectivity"
		protobufMessage:  "SplitHorizonPartitionConnectivityContractSplitHorizonPartitionConnectivityDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SplitHorizonPartitionConnectivityContractSplitHorizonPartitionConnectivityDataModel"
		sourcePath:       "src/draft/split-horizon-partition-connectivity-contract/src/split-horizon-partition-connectivity.ts"
		packageName:      "split-horizon-partition-connectivity-contract"
		domain:           "split-horizon-partition-connectivity"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.sre-decision-tree-contract.sre-decision-tree"
		protobufMessage:  "SreDecisionTreeContractSreDecisionTreeDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SreDecisionTreeContractSreDecisionTreeDataModel"
		sourcePath:       "src/draft/sre-decision-tree-contract/src/sre-decision-tree.ts"
		packageName:      "sre-decision-tree-contract"
		domain:           "sre-decision-tree"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.sre-diagnose-projection-contract.sre-diagnose-projection"
		protobufMessage:  "SreDiagnoseProjectionContractSreDiagnoseProjectionDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SreDiagnoseProjectionContractSreDiagnoseProjectionDataModel"
		sourcePath:       "src/draft/sre-diagnose-projection-contract/src/sre-diagnose-projection.ts"
		packageName:      "sre-diagnose-projection-contract"
		domain:           "sre-diagnose-projection"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.sre-drift-remediation-journey-contract.sre-drift-remediation-journey"
		protobufMessage:  "SreDriftRemediationJourneyContractSreDriftRemediationJourneyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SreDriftRemediationJourneyContractSreDriftRemediationJourneyDataModel"
		sourcePath:       "src/draft/sre-drift-remediation-journey-contract/src/sre-drift-remediation-journey.ts"
		packageName:      "sre-drift-remediation-journey-contract"
		domain:           "sre-drift-remediation-journey"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.sre-mttd-mttr-postmortem-contract.sre-mttd-mttr-postmortem"
		protobufMessage:  "SreMttdMttrPostmortemContractSreMttdMttrPostmortemDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SreMttdMttrPostmortemContractSreMttdMttrPostmortemDataModel"
		sourcePath:       "src/draft/sre-mttd-mttr-postmortem-contract/src/sre-mttd-mttr-postmortem.ts"
		packageName:      "sre-mttd-mttr-postmortem-contract"
		domain:           "sre-mttd-mttr-postmortem"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.sre-operator-skeleton-contract.sre-operator-skeleton"
		protobufMessage:  "SreOperatorSkeletonContractSreOperatorSkeletonDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SreOperatorSkeletonContractSreOperatorSkeletonDataModel"
		sourcePath:       "src/draft/sre-operator-skeleton-contract/src/sre-operator-skeleton.ts"
		packageName:      "sre-operator-skeleton-contract"
		domain:           "sre-operator-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.static-key-escape-hatch-contract.static-key-escape-hatch"
		protobufMessage:  "StaticKeyEscapeHatchContractStaticKeyEscapeHatchDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#StaticKeyEscapeHatchContractStaticKeyEscapeHatchDataModel"
		sourcePath:       "src/draft/static-key-escape-hatch-contract/src/static-key-escape-hatch.ts"
		packageName:      "static-key-escape-hatch-contract"
		domain:           "static-key-escape-hatch"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.streamer-runtime-port-contract.streamer-runtime-port"
		protobufMessage:  "StreamerRuntimePortContractStreamerRuntimePortDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#StreamerRuntimePortContractStreamerRuntimePortDataModel"
		sourcePath:       "src/draft/streamer-runtime-port-contract/src/streamer-runtime-port.ts"
		packageName:      "streamer-runtime-port-contract"
		domain:           "streamer-runtime-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.structured-log-pipeline-contract.structured-log-pipeline"
		protobufMessage:  "StructuredLogPipelineContractStructuredLogPipelineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#StructuredLogPipelineContractStructuredLogPipelineDataModel"
		sourcePath:       "src/draft/structured-log-pipeline-contract/src/structured-log-pipeline.ts"
		packageName:      "structured-log-pipeline-contract"
		domain:           "structured-log-pipeline"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.stuck-rollout-convergence-contract.stuck-rollout-convergence"
		protobufMessage:  "StuckRolloutConvergenceContractStuckRolloutConvergenceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#StuckRolloutConvergenceContractStuckRolloutConvergenceDataModel"
		sourcePath:       "src/draft/stuck-rollout-convergence-contract/src/stuck-rollout-convergence.ts"
		packageName:      "stuck-rollout-convergence-contract"
		domain:           "stuck-rollout-convergence"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.svid-auto-rotation-contract.svid-rotation"
		protobufMessage:  "SvidAutoRotationContractSvidRotationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SvidAutoRotationContractSvidRotationDataModel"
		sourcePath:       "src/draft/svid-auto-rotation-contract/src/svid-rotation.ts"
		packageName:      "svid-auto-rotation-contract"
		domain:           "svid-auto-rotation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.svid-cross-tenant-guard-contract.svid-cross-tenant-guard"
		protobufMessage:  "SvidCrossTenantGuardContractSvidCrossTenantGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SvidCrossTenantGuardContractSvidCrossTenantGuardDataModel"
		sourcePath:       "src/draft/svid-cross-tenant-guard-contract/src/svid-cross-tenant-guard.ts"
		packageName:      "svid-cross-tenant-guard-contract"
		domain:           "svid-cross-tenant-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.svid-partition-grace-spike.partition-grace"
		protobufMessage:  "SvidPartitionGraceSpikePartitionGraceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SvidPartitionGraceSpikePartitionGraceDataModel"
		sourcePath:       "src/draft/svid-partition-grace-spike/src/partition-grace.ts"
		packageName:      "svid-partition-grace-spike"
		domain:           "svid-partition-grace"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.system-failure-classifier-contract.classifier"
		protobufMessage:  "SystemFailureClassifierContractClassifierDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#SystemFailureClassifierContractClassifierDataModel"
		sourcePath:       "src/draft/system-failure-classifier-contract/src/classifier.ts"
		packageName:      "system-failure-classifier-contract"
		domain:           "system-failure-classifier"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.telemetry-envelope-contract.telemetry-envelope-contract"
		protobufMessage:  "TelemetryEnvelopeContractTelemetryEnvelopeContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TelemetryEnvelopeContractTelemetryEnvelopeContractDataModel"
		sourcePath:       "src/draft/telemetry-envelope-contract/src/telemetry-envelope-contract.ts"
		packageName:      "telemetry-envelope-contract"
		domain:           "telemetry-envelope"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.tenant-data-lifecycle-contract.tenant-data-lifecycle"
		protobufMessage:  "TenantDataLifecycleContractTenantDataLifecycleDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TenantDataLifecycleContractTenantDataLifecycleDataModel"
		sourcePath:       "src/draft/tenant-data-lifecycle-contract/src/tenant-data-lifecycle.ts"
		packageName:      "tenant-data-lifecycle-contract"
		domain:           "tenant-data-lifecycle"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.tier-five-public-mtls-contract.tier-five-public-mtls"
		protobufMessage:  "TierFivePublicMtlsContractTierFivePublicMtlsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TierFivePublicMtlsContractTierFivePublicMtlsDataModel"
		sourcePath:       "src/draft/tier-five-public-mtls-contract/src/tier-five-public-mtls.ts"
		packageName:      "tier-five-public-mtls-contract"
		domain:           "tier-five-public-mtls"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.tier-four-overlay-mesh-contract.tier-four-overlay-mesh"
		protobufMessage:  "TierFourOverlayMeshContractTierFourOverlayMeshDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TierFourOverlayMeshContractTierFourOverlayMeshDataModel"
		sourcePath:       "src/draft/tier-four-overlay-mesh-contract/src/tier-four-overlay-mesh.ts"
		packageName:      "tier-four-overlay-mesh-contract"
		domain:           "tier-four-overlay-mesh"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.tier-one-private-network-contract.tier-one-private-network"
		protobufMessage:  "TierOnePrivateNetworkContractTierOnePrivateNetworkDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TierOnePrivateNetworkContractTierOnePrivateNetworkDataModel"
		sourcePath:       "src/draft/tier-one-private-network-contract/src/tier-one-private-network.ts"
		packageName:      "tier-one-private-network-contract"
		domain:           "tier-one-private-network"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.tier-three-private-interconnect-contract.tier-three-private-interconnect"
		protobufMessage:  "TierThreePrivateInterconnectContractTierThreePrivateInterconnectDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TierThreePrivateInterconnectContractTierThreePrivateInterconnectDataModel"
		sourcePath:       "src/draft/tier-three-private-interconnect-contract/src/tier-three-private-interconnect.ts"
		packageName:      "tier-three-private-interconnect-contract"
		domain:           "tier-three-private-interconnect"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.tier-two-cross-region-network-contract.tier-two-cross-region-network"
		protobufMessage:  "TierTwoCrossRegionNetworkContractTierTwoCrossRegionNetworkDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TierTwoCrossRegionNetworkContractTierTwoCrossRegionNetworkDataModel"
		sourcePath:       "src/draft/tier-two-cross-region-network-contract/src/tier-two-cross-region-network.ts"
		packageName:      "tier-two-cross-region-network-contract"
		domain:           "tier-two-cross-region-network"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.token-broker-ha-cache-contract.token-broker-ha-cache"
		protobufMessage:  "TokenBrokerHaCacheContractTokenBrokerHaCacheDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TokenBrokerHaCacheContractTokenBrokerHaCacheDataModel"
		sourcePath:       "src/draft/token-broker-ha-cache-contract/src/token-broker-ha-cache.ts"
		packageName:      "token-broker-ha-cache-contract"
		domain:           "token-broker-ha-cache"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.token-broker-skeleton-contract.token-broker-skeleton"
		protobufMessage:  "TokenBrokerSkeletonContractTokenBrokerSkeletonDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TokenBrokerSkeletonContractTokenBrokerSkeletonDataModel"
		sourcePath:       "src/draft/token-broker-skeleton-contract/src/token-broker-skeleton.ts"
		packageName:      "token-broker-skeleton-contract"
		domain:           "token-broker-skeleton"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.token-replay-resistance-contract.token-replay-resistance"
		protobufMessage:  "TokenReplayResistanceContractTokenReplayResistanceDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TokenReplayResistanceContractTokenReplayResistanceDataModel"
		sourcePath:       "src/draft/token-replay-resistance-contract/src/token-replay-resistance.ts"
		packageName:      "token-replay-resistance-contract"
		domain:           "token-replay-resistance"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.topology-objects-contract.topology-objects"
		protobufMessage:  "TopologyObjectsContractTopologyObjectsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TopologyObjectsContractTopologyObjectsDataModel"
		sourcePath:       "src/draft/topology-objects-contract/src/topology-objects.ts"
		packageName:      "topology-objects-contract"
		domain:           "topology-objects"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.topology-override-conflict-contract.topology-override-conflict"
		protobufMessage:  "TopologyOverrideConflictContractTopologyOverrideConflictDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TopologyOverrideConflictContractTopologyOverrideConflictDataModel"
		sourcePath:       "src/draft/topology-override-conflict-contract/src/topology-override-conflict.ts"
		packageName:      "topology-override-conflict-contract"
		domain:           "topology-override-conflict"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.trace-context-propagation-contract.trace-context-propagation"
		protobufMessage:  "TraceContextPropagationContractTraceContextPropagationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TraceContextPropagationContractTraceContextPropagationDataModel"
		sourcePath:       "src/draft/trace-context-propagation-contract/src/trace-context-propagation.ts"
		packageName:      "trace-context-propagation-contract"
		domain:           "trace-context-propagation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.training-data-poisoning-guard-contract.training-data-poisoning-guard"
		protobufMessage:  "TrainingDataPoisoningGuardContractTrainingDataPoisoningGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TrainingDataPoisoningGuardContractTrainingDataPoisoningGuardDataModel"
		sourcePath:       "src/draft/training-data-poisoning-guard-contract/src/training-data-poisoning-guard.ts"
		packageName:      "training-data-poisoning-guard-contract"
		domain:           "training-data-poisoning-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.training-engine-port-contract.training-engine-contract"
		protobufMessage:  "TrainingEnginePortContractTrainingEngineContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TrainingEnginePortContractTrainingEngineContractDataModel"
		sourcePath:       "src/draft/training-engine-port-contract/src/training-engine-contract.ts"
		packageName:      "training-engine-port-contract"
		domain:           "training-engine-port"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.trust-tier-policy-contract.trust-tier-policy"
		protobufMessage:  "TrustTierPolicyContractTrustTierPolicyDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#TrustTierPolicyContractTrustTierPolicyDataModel"
		sourcePath:       "src/draft/trust-tier-policy-contract/src/trust-tier-policy.ts"
		packageName:      "trust-tier-policy-contract"
		domain:           "trust-tier-policy"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.usage-inferred-permissions-contract.usage-permissions"
		protobufMessage:  "UsageInferredPermissionsContractUsagePermissionsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#UsageInferredPermissionsContractUsagePermissionsDataModel"
		sourcePath:       "src/draft/usage-inferred-permissions-contract/src/usage-permissions.ts"
		packageName:      "usage-inferred-permissions-contract"
		domain:           "usage-inferred-permissions"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.v1-cutline-contract.v1-cutline"
		protobufMessage:  "V1CutlineContractV1CutlineDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#V1CutlineContractV1CutlineDataModel"
		sourcePath:       "src/draft/v1-cutline-contract/src/v1-cutline.ts"
		packageName:      "v1-cutline-contract"
		domain:           "v1-cutline"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.v1-release-notes-upgrade-guide-contract.release-notes-upgrade-guide"
		protobufMessage:  "V1ReleaseNotesUpgradeGuideContractReleaseNotesUpgradeGuideDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#V1ReleaseNotesUpgradeGuideContractReleaseNotesUpgradeGuideDataModel"
		sourcePath:       "src/draft/v1-release-notes-upgrade-guide-contract/src/release-notes-upgrade-guide.ts"
		packageName:      "v1-release-notes-upgrade-guide-contract"
		domain:           "v1-release-notes-upgrade-guide"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.version-compat-resolution-semantics.resolution-semantics"
		protobufMessage:  "VersionCompatResolutionSemanticsResolutionSemanticsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#VersionCompatResolutionSemanticsResolutionSemanticsDataModel"
		sourcePath:       "src/draft/version-compat-resolution-semantics/src/resolution-semantics.ts"
		packageName:      "version-compat-resolution-semantics"
		domain:           "version-compat-resolution-semantics"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.version-pinning-drift-guard-contract.version-pinning-drift-guard"
		protobufMessage:  "VersionPinningDriftGuardContractVersionPinningDriftGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#VersionPinningDriftGuardContractVersionPinningDriftGuardDataModel"
		sourcePath:       "src/draft/version-pinning-drift-guard-contract/src/version-pinning-drift-guard.ts"
		packageName:      "version-pinning-drift-guard-contract"
		domain:           "version-pinning-drift-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.vm-microvm-build-providers-contract.vm-microvm-build-providers"
		protobufMessage:  "VmMicrovmBuildProvidersContractVmMicrovmBuildProvidersDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#VmMicrovmBuildProvidersContractVmMicrovmBuildProvidersDataModel"
		sourcePath:       "src/draft/vm-microvm-build-providers-contract/src/vm-microvm-build-providers.ts"
		packageName:      "vm-microvm-build-providers-contract"
		domain:           "vm-microvm-build-providers"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.vscode-extension-contract.vscode-extension-contract"
		protobufMessage:  "VscodeExtensionContractVscodeExtensionContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#VscodeExtensionContractVscodeExtensionContractDataModel"
		sourcePath:       "src/draft/vscode-extension-contract/src/vscode-extension-contract.ts"
		packageName:      "vscode-extension-contract"
		domain:           "vscode-extension"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.wasi-interface-pins.wasi-pins"
		protobufMessage:  "WasiInterfacePinsWasiPinsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WasiInterfacePinsWasiPinsDataModel"
		sourcePath:       "src/draft/wasi-interface-pins/src/wasi-pins.ts"
		packageName:      "wasi-interface-pins"
		domain:           "wasi-interface-pins"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.websocket-preview-wit-contract.websocket-preview-contract"
		protobufMessage:  "WebsocketPreviewWitContractWebsocketPreviewContractDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WebsocketPreviewWitContractWebsocketPreviewContractDataModel"
		sourcePath:       "src/draft/websocket-preview-wit-contract/src/websocket-preview-contract.ts"
		packageName:      "websocket-preview-wit-contract"
		domain:           "websocket-preview-wit"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.websocket-streamer-fanout-contract.websocket-streamer-fanout"
		protobufMessage:  "WebsocketStreamerFanoutContractWebsocketStreamerFanoutDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WebsocketStreamerFanoutContractWebsocketStreamerFanoutDataModel"
		sourcePath:       "src/draft/websocket-streamer-fanout-contract/src/websocket-streamer-fanout.ts"
		packageName:      "websocket-streamer-fanout-contract"
		domain:           "websocket-streamer-fanout"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.wire-version-negotiation-contract.wire-version-negotiation"
		protobufMessage:  "WireVersionNegotiationContractWireVersionNegotiationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WireVersionNegotiationContractWireVersionNegotiationDataModel"
		sourcePath:       "src/draft/wire-version-negotiation-contract/src/wire-version-negotiation.ts"
		packageName:      "wire-version-negotiation-contract"
		domain:           "wire-version-negotiation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.workload-attestation-intake-contract.workload-attestation"
		protobufMessage:  "WorkloadAttestationIntakeContractWorkloadAttestationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WorkloadAttestationIntakeContractWorkloadAttestationDataModel"
		sourcePath:       "src/draft/workload-attestation-intake-contract/src/workload-attestation.ts"
		packageName:      "workload-attestation-intake-contract"
		domain:           "workload-attestation-intake"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.wrpc-deadline-propagation-contract.wrpc-deadline-propagation"
		protobufMessage:  "WrpcDeadlinePropagationContractWrpcDeadlinePropagationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WrpcDeadlinePropagationContractWrpcDeadlinePropagationDataModel"
		sourcePath:       "src/draft/wrpc-deadline-propagation-contract/src/wrpc-deadline-propagation.ts"
		packageName:      "wrpc-deadline-propagation-contract"
		domain:           "wrpc-deadline-propagation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.wrpc-in-process-link-contract.wrpc-in-process-link"
		protobufMessage:  "WrpcInProcessLinkContractWrpcInProcessLinkDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WrpcInProcessLinkContractWrpcInProcessLinkDataModel"
		sourcePath:       "src/draft/wrpc-in-process-link-contract/src/wrpc-in-process-link.ts"
		packageName:      "wrpc-in-process-link-contract"
		domain:           "wrpc-in-process-link"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.wrpc-lattice-transport-contract.wrpc-lattice-transport"
		protobufMessage:  "WrpcLatticeTransportContractWrpcLatticeTransportDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WrpcLatticeTransportContractWrpcLatticeTransportDataModel"
		sourcePath:       "src/draft/wrpc-lattice-transport-contract/src/wrpc-lattice-transport.ts"
		packageName:      "wrpc-lattice-transport-contract"
		domain:           "wrpc-lattice-transport"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.wrpc-membrane-failure-contract.wrpc-membrane-failure"
		protobufMessage:  "WrpcMembraneFailureContractWrpcMembraneFailureDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#WrpcMembraneFailureContractWrpcMembraneFailureDataModel"
		sourcePath:       "src/draft/wrpc-membrane-failure-contract/src/wrpc-membrane-failure.ts"
		packageName:      "wrpc-membrane-failure-contract"
		domain:           "wrpc-membrane-failure"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.x509-svid-mtls-contract.x509-svid-mtls"
		protobufMessage:  "X509SvidMtlsContractX509SvidMtlsDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#X509SvidMtlsContractX509SvidMtlsDataModel"
		sourcePath:       "src/draft/x509-svid-mtls-contract/src/x509-svid-mtls.ts"
		packageName:      "x509-svid-mtls-contract"
		domain:           "x509-svid-mtls"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.xaa-confused-deputy-guard-contract.xaa-confused-deputy-guard"
		protobufMessage:  "XaaConfusedDeputyGuardContractXaaConfusedDeputyGuardDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#XaaConfusedDeputyGuardContractXaaConfusedDeputyGuardDataModel"
		sourcePath:       "src/draft/xaa-confused-deputy-guard-contract/src/xaa-confused-deputy-guard.ts"
		packageName:      "xaa-confused-deputy-guard-contract"
		domain:           "xaa-confused-deputy-guard"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.yard-domain-validation-contract.yard-domain-validation"
		protobufMessage:  "YardDomainValidationContractYardDomainValidationDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#YardDomainValidationContractYardDomainValidationDataModel"
		sourcePath:       "src/draft/yard-domain-validation-contract/src/yard-domain-validation.ts"
		packageName:      "yard-domain-validation-contract"
		domain:           "yard-domain-validation"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.yard-identity-issuer-contract.issuer"
		protobufMessage:  "YardIdentityIssuerContractIssuerDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#YardIdentityIssuerContractIssuerDataModel"
		sourcePath:       "src/draft/yard-identity-issuer-contract/src/issuer.ts"
		packageName:      "yard-identity-issuer-contract"
		domain:           "yard-identity-issuer"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	{
		contractId:       "hobo.datamodel.yard-topology-manifest-contract.yard-topology-manifest"
		protobufMessage:  "YardTopologyManifestContractYardTopologyManifestDataModel"
		protobufPackage:  "hobo.datamodels.v1"
		cueDefinition:    "#YardTopologyManifestContractYardTopologyManifestDataModel"
		sourcePath:       "src/draft/yard-topology-manifest-contract/src/yard-topology-manifest.ts"
		packageName:      "yard-topology-manifest-contract"
		domain:           "yard-topology-manifest"
		integrationBoundaries: ["module", "contract", "test"]
		cueAnnotated:     true
	},
	]
}

#AcmeDns01CertIssuanceContractAcmeDns01CertIssuanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.acme-dns01-cert-issuance-contract.acme-dns01-cert-issuance"
	protobufMessage: "AcmeDns01CertIssuanceContractAcmeDns01CertIssuanceDataModel"
	sourcePath:      "src/draft/acme-dns01-cert-issuance-contract/src/acme-dns01-cert-issuance.ts"
	packageName:     "acme-dns01-cert-issuance-contract"
	domain:          "acme-dns01-cert-issuance"
}

#ActorHostRuntimePortContractActorHostRuntimePortDataModel: #DataModel & {
	contractId:      "hobo.datamodel.actor-host-runtime-port-contract.actor-host-runtime-port"
	protobufMessage: "ActorHostRuntimePortContractActorHostRuntimePortDataModel"
	sourcePath:      "src/draft/actor-host-runtime-port-contract/src/actor-host-runtime-port.ts"
	packageName:     "actor-host-runtime-port-contract"
	domain:          "actor-host-runtime-port"
}

#AdoptInPlaceContractAdoptInPlaceContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.adopt-in-place-contract.adopt-in-place-contract"
	protobufMessage: "AdoptInPlaceContractAdoptInPlaceContractDataModel"
	sourcePath:      "src/draft/adopt-in-place-contract/src/adopt-in-place-contract.ts"
	packageName:     "adopt-in-place-contract"
	domain:          "adopt-in-place"
}

#AlertmanagerRoutingContractAlertmanagerRoutingDataModel: #DataModel & {
	contractId:      "hobo.datamodel.alertmanager-routing-contract.alertmanager-routing"
	protobufMessage: "AlertmanagerRoutingContractAlertmanagerRoutingDataModel"
	sourcePath:      "src/draft/alertmanager-routing-contract/src/alertmanager-routing.ts"
	packageName:     "alertmanager-routing-contract"
	domain:          "alertmanager-routing"
}

#AnonymousPreviewPathContractAnonymousPreviewPathDataModel: #DataModel & {
	contractId:      "hobo.datamodel.anonymous-preview-path-contract.anonymous-preview-path"
	protobufMessage: "AnonymousPreviewPathContractAnonymousPreviewPathDataModel"
	sourcePath:      "src/draft/anonymous-preview-path-contract/src/anonymous-preview-path.ts"
	packageName:     "anonymous-preview-path-contract"
	domain:          "anonymous-preview-path"
}

#AppDevJourneyContractAppDevJourneyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.app-dev-journey-contract.app-dev-journey"
	protobufMessage: "AppDevJourneyContractAppDevJourneyDataModel"
	sourcePath:      "src/draft/app-dev-journey-contract/src/app-dev-journey.ts"
	packageName:     "app-dev-journey-contract"
	domain:          "app-dev-journey"
}

#ArtifactRepoPortContractArtifactRepoPortDataModel: #DataModel & {
	contractId:      "hobo.datamodel.artifact-repo-port-contract.artifact-repo-port"
	protobufMessage: "ArtifactRepoPortContractArtifactRepoPortDataModel"
	sourcePath:      "src/draft/artifact-repo-port-contract/src/artifact-repo-port.ts"
	packageName:     "artifact-repo-port-contract"
	domain:          "artifact-repo-port"
}

#AuthFlagReadsetContractAuthFlagReadsetDataModel: #DataModel & {
	contractId:      "hobo.datamodel.auth-flag-readset-contract.auth-flag-readset"
	protobufMessage: "AuthFlagReadsetContractAuthFlagReadsetDataModel"
	sourcePath:      "src/draft/auth-flag-readset-contract/src/auth-flag-readset.ts"
	packageName:     "auth-flag-readset-contract"
	domain:          "auth-flag-readset"
}

#AuthPortRbacResolutionContractAuthPortRbacResolutionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.auth-port-rbac-resolution-contract.auth-port-rbac-resolution"
	protobufMessage: "AuthPortRbacResolutionContractAuthPortRbacResolutionDataModel"
	sourcePath:      "src/draft/auth-port-rbac-resolution-contract/src/auth-port-rbac-resolution.ts"
	packageName:     "auth-port-rbac-resolution-contract"
	domain:          "auth-port-rbac-resolution"
}

#AuthorTimeCapabilityFeedbackContractAuthorTimeCapabilityFeedbackDataModel: #DataModel & {
	contractId:      "hobo.datamodel.author-time-capability-feedback-contract.author-time-capability-feedback"
	protobufMessage: "AuthorTimeCapabilityFeedbackContractAuthorTimeCapabilityFeedbackDataModel"
	sourcePath:      "src/draft/author-time-capability-feedback-contract/src/author-time-capability-feedback.ts"
	packageName:     "author-time-capability-feedback-contract"
	domain:          "author-time-capability-feedback"
}

#AutonomousDriftRemediationContractAutonomousDriftRemediationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.autonomous-drift-remediation-contract.autonomous-drift-remediation"
	protobufMessage: "AutonomousDriftRemediationContractAutonomousDriftRemediationDataModel"
	sourcePath:      "src/draft/autonomous-drift-remediation-contract/src/autonomous-drift-remediation.ts"
	packageName:     "autonomous-drift-remediation-contract"
	domain:          "autonomous-drift-remediation"
}

#AvailabilityViewContractAvailabilityViewDataModel: #DataModel & {
	contractId:      "hobo.datamodel.availability-view-contract.availability-view"
	protobufMessage: "AvailabilityViewContractAvailabilityViewDataModel"
	sourcePath:      "src/draft/availability-view-contract/src/availability-view.ts"
	packageName:     "availability-view-contract"
	domain:          "availability-view"
}

#BillingLaunchPolicyContractBillingLaunchPolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.billing-launch-policy-contract.billing-launch-policy"
	protobufMessage: "BillingLaunchPolicyContractBillingLaunchPolicyDataModel"
	sourcePath:      "src/draft/billing-launch-policy-contract/src/billing-launch-policy.ts"
	packageName:     "billing-launch-policy-contract"
	domain:          "billing-launch-policy"
}

#BindReferenceWiringContractBindReferenceContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.bind-reference-wiring-contract.bind-reference-contract"
	protobufMessage: "BindReferenceWiringContractBindReferenceContractDataModel"
	sourcePath:      "src/draft/bind-reference-wiring-contract/src/bind-reference-contract.ts"
	packageName:     "bind-reference-wiring-contract"
	domain:          "bind-reference-wiring"
}

#BudgetQuotaPolicyContractBudgetQuotaPolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.budget-quota-policy-contract.budget-quota-policy"
	protobufMessage: "BudgetQuotaPolicyContractBudgetQuotaPolicyDataModel"
	sourcePath:      "src/draft/budget-quota-policy-contract/src/budget-quota-policy.ts"
	packageName:     "budget-quota-policy-contract"
	domain:          "budget-quota-policy"
}

#BuildDaggerProviderContractBuildDaggerProviderDataModel: #DataModel & {
	contractId:      "hobo.datamodel.build-dagger-provider-contract.build-dagger-provider"
	protobufMessage: "BuildDaggerProviderContractBuildDaggerProviderDataModel"
	sourcePath:      "src/draft/build-dagger-provider-contract/src/build-dagger-provider.ts"
	packageName:     "build-dagger-provider-contract"
	domain:          "build-dagger-provider"
}

#BuildWasmProviderContractBuildWasmProviderDataModel: #DataModel & {
	contractId:      "hobo.datamodel.build-wasm-provider-contract.build-wasm-provider"
	protobufMessage: "BuildWasmProviderContractBuildWasmProviderDataModel"
	sourcePath:      "src/draft/build-wasm-provider-contract/src/build-wasm-provider.ts"
	packageName:     "build-wasm-provider-contract"
	domain:          "build-wasm-provider"
}

#BuiltInFlagStoreContractBuiltInFlagStoreDataModel: #DataModel & {
	contractId:      "hobo.datamodel.built-in-flag-store-contract.built-in-flag-store"
	protobufMessage: "BuiltInFlagStoreContractBuiltInFlagStoreDataModel"
	sourcePath:      "src/draft/built-in-flag-store-contract/src/built-in-flag-store.ts"
	packageName:     "built-in-flag-store-contract"
	domain:          "built-in-flag-store"
}

#BuiltInOptoTrainingEngineContractBuiltInOptoTrainingEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.built-in-opto-training-engine-contract.built-in-opto-training-engine"
	protobufMessage: "BuiltInOptoTrainingEngineContractBuiltInOptoTrainingEngineDataModel"
	sourcePath:      "src/draft/built-in-opto-training-engine-contract/src/built-in-opto-training-engine.ts"
	packageName:     "built-in-opto-training-engine-contract"
	domain:          "built-in-opto-training-engine"
}

#BuiltInPolicyEngineContractBuiltInPolicyEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.built-in-policy-engine-contract.built-in-policy-engine"
	protobufMessage: "BuiltInPolicyEngineContractBuiltInPolicyEngineDataModel"
	sourcePath:      "src/draft/built-in-policy-engine-contract/src/built-in-policy-engine.ts"
	packageName:     "built-in-policy-engine-contract"
	domain:          "built-in-policy-engine"
}

#CampEventstoreRuntimePortContractCampEventstoreRuntimePortDataModel: #DataModel & {
	contractId:      "hobo.datamodel.camp-eventstore-runtime-port-contract.camp-eventstore-runtime-port"
	protobufMessage: "CampEventstoreRuntimePortContractCampEventstoreRuntimePortDataModel"
	sourcePath:      "src/draft/camp-eventstore-runtime-port-contract/src/camp-eventstore-runtime-port.ts"
	packageName:     "camp-eventstore-runtime-port-contract"
	domain:          "camp-eventstore-runtime-port"
}

#CampMappingSugarCompilerCampMappingSugarCompilerDataModel: #DataModel & {
	contractId:      "hobo.datamodel.camp-mapping-sugar-compiler.camp-mapping-sugar-compiler"
	protobufMessage: "CampMappingSugarCompilerCampMappingSugarCompilerDataModel"
	sourcePath:      "src/draft/camp-mapping-sugar-compiler/src/camp-mapping-sugar-compiler.ts"
	packageName:     "camp-mapping-sugar-compiler"
	domain:          "camp-mapping-sugar-compiler"
}

#CanDeployCompatibilityGateContractCompatibilityGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.can-deploy-compatibility-gate-contract.compatibility-gate"
	protobufMessage: "CanDeployCompatibilityGateContractCompatibilityGateDataModel"
	sourcePath:      "src/draft/can-deploy-compatibility-gate-contract/src/compatibility-gate.ts"
	packageName:     "can-deploy-compatibility-gate-contract"
	domain:          "can-deploy-compatibility-gate"
}

#CapabilityEnforcementContractCapabilityEnforcementDataModel: #DataModel & {
	contractId:      "hobo.datamodel.capability-enforcement-contract.capability-enforcement"
	protobufMessage: "CapabilityEnforcementContractCapabilityEnforcementDataModel"
	sourcePath:      "src/draft/capability-enforcement-contract/src/capability-enforcement.ts"
	packageName:     "capability-enforcement-contract"
	domain:          "capability-enforcement"
}

#CapabilityIndexedDiscoveryContractCapabilityIndexedDiscoveryDataModel: #DataModel & {
	contractId:      "hobo.datamodel.capability-indexed-discovery-contract.capability-indexed-discovery"
	protobufMessage: "CapabilityIndexedDiscoveryContractCapabilityIndexedDiscoveryDataModel"
	sourcePath:      "src/draft/capability-indexed-discovery-contract/src/capability-indexed-discovery.ts"
	packageName:     "capability-indexed-discovery-contract"
	domain:          "capability-indexed-discovery"
}

#CapabilityNegotiationContractCapabilityNegotiationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.capability-negotiation-contract.capability-negotiation"
	protobufMessage: "CapabilityNegotiationContractCapabilityNegotiationDataModel"
	sourcePath:      "src/draft/capability-negotiation-contract/src/capability-negotiation.ts"
	packageName:     "capability-negotiation-contract"
	domain:          "capability-negotiation"
}

#CapabilitySpecContractCapabilitySpecDataModel: #DataModel & {
	contractId:      "hobo.datamodel.capability-spec-contract.capability-spec"
	protobufMessage: "CapabilitySpecContractCapabilitySpecDataModel"
	sourcePath:      "src/draft/capability-spec-contract/src/capability-spec.ts"
	packageName:     "capability-spec-contract"
	domain:          "capability-spec"
}

#ChampionChallengerPromotionContractChampionChallengerPromotionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.champion-challenger-promotion-contract.champion-challenger-promotion"
	protobufMessage: "ChampionChallengerPromotionContractChampionChallengerPromotionDataModel"
	sourcePath:      "src/draft/champion-challenger-promotion-contract/src/champion-challenger-promotion.ts"
	packageName:     "champion-challenger-promotion-contract"
	domain:          "champion-challenger-promotion"
}

#ChaosExperimentOrchestrationContractChaosExperimentOrchestrationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.chaos-experiment-orchestration-contract.chaos-experiment-orchestration"
	protobufMessage: "ChaosExperimentOrchestrationContractChaosExperimentOrchestrationDataModel"
	sourcePath:      "src/draft/chaos-experiment-orchestration-contract/src/chaos-experiment-orchestration.ts"
	packageName:     "chaos-experiment-orchestration-contract"
	domain:          "chaos-experiment-orchestration"
}

#ChoreographedCompensationContractChoreographedCompensationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.choreographed-compensation-contract.choreographed-compensation"
	protobufMessage: "ChoreographedCompensationContractChoreographedCompensationDataModel"
	sourcePath:      "src/draft/choreographed-compensation-contract/src/choreographed-compensation.ts"
	packageName:     "choreographed-compensation-contract"
	domain:          "choreographed-compensation"
}

#ChoreographySagaEngineContractChoreographySagaEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.choreography-saga-engine-contract.choreography-saga-engine"
	protobufMessage: "ChoreographySagaEngineContractChoreographySagaEngineDataModel"
	sourcePath:      "src/draft/choreography-saga-engine-contract/src/choreography-saga-engine.ts"
	packageName:     "choreography-saga-engine-contract"
	domain:          "choreography-saga-engine"
}

#CiFabricOidcE2eContractCiFabricContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.ci-fabric-oidc-e2e-contract.ci-fabric-contract"
	protobufMessage: "CiFabricOidcE2eContractCiFabricContractDataModel"
	sourcePath:      "src/draft/ci-fabric-oidc-e2e-contract/src/ci-fabric-contract.ts"
	packageName:     "ci-fabric-oidc-e2e-contract"
	domain:          "ci-fabric-oidc-e2e"
}

#CliCredentialHardeningContractCliCredentialHardeningDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cli-credential-hardening-contract.cli-credential-hardening"
	protobufMessage: "CliCredentialHardeningContractCliCredentialHardeningDataModel"
	sourcePath:      "src/draft/cli-credential-hardening-contract/src/cli-credential-hardening.ts"
	packageName:     "cli-credential-hardening-contract"
	domain:          "cli-credential-hardening"
}

#ClientOptimisticUpdateContractClientOptimisticUpdateContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.client-optimistic-update-contract.client-optimistic-update-contract"
	protobufMessage: "ClientOptimisticUpdateContractClientOptimisticUpdateContractDataModel"
	sourcePath:      "src/draft/client-optimistic-update-contract/src/client-optimistic-update-contract.ts"
	packageName:     "client-optimistic-update-contract"
	domain:          "client-optimistic-update"
}

#ClosureBuilderPublicApiContractClosureBuilderPublicApiDataModel: #DataModel & {
	contractId:      "hobo.datamodel.closure-builder-public-api-contract.closure-builder-public-api"
	protobufMessage: "ClosureBuilderPublicApiContractClosureBuilderPublicApiDataModel"
	sourcePath:      "src/draft/closure-builder-public-api-contract/src/closure-builder-public-api.ts"
	packageName:     "closure-builder-public-api-contract"
	domain:          "closure-builder-public-api"
}

#CollectionCoverageGateContractCollectionCoverageGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.collection-coverage-gate-contract.collection-coverage-gate"
	protobufMessage: "CollectionCoverageGateContractCollectionCoverageGateDataModel"
	sourcePath:      "src/draft/collection-coverage-gate-contract/src/collection-coverage-gate.ts"
	packageName:     "collection-coverage-gate-contract"
	domain:          "collection-coverage-gate"
}

#CompensationEscalationContractCompensationEscalationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.compensation-escalation-contract.compensation-escalation"
	protobufMessage: "CompensationEscalationContractCompensationEscalationDataModel"
	sourcePath:      "src/draft/compensation-escalation-contract/src/compensation-escalation.ts"
	packageName:     "compensation-escalation-contract"
	domain:          "compensation-escalation"
}

#ComponentHostAdapterCertificationSpikeComponentHostAdapterCertificationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.component-host-adapter-certification-spike.component-host-adapter-certification"
	protobufMessage: "ComponentHostAdapterCertificationSpikeComponentHostAdapterCertificationDataModel"
	sourcePath:      "src/draft/component-host-adapter-certification-spike/src/component-host-adapter-certification.ts"
	packageName:     "component-host-adapter-certification-spike"
	domain:          "component-host-adapter-certification"
}

#ComponentHostConformanceSuiteComponentHostConformanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.component-host-conformance-suite.component-host-conformance"
	protobufMessage: "ComponentHostConformanceSuiteComponentHostConformanceDataModel"
	sourcePath:      "src/draft/component-host-conformance-suite/src/component-host-conformance.ts"
	packageName:     "component-host-conformance-suite"
	domain:          "component-host-conformance"
}

#ComponentHostOciFloorContractComponentHostOciFloorDataModel: #DataModel & {
	contractId:      "hobo.datamodel.component-host-oci-floor-contract.component-host-oci-floor"
	protobufMessage: "ComponentHostOciFloorContractComponentHostOciFloorDataModel"
	sourcePath:      "src/draft/component-host-oci-floor-contract/src/component-host-oci-floor.ts"
	packageName:     "component-host-oci-floor-contract"
	domain:          "component-host-oci-floor"
}

#ConformancePortSuiteContractConformancePortSuiteDataModel: #DataModel & {
	contractId:      "hobo.datamodel.conformance-port-suite-contract.conformance-port-suite"
	protobufMessage: "ConformancePortSuiteContractConformancePortSuiteDataModel"
	sourcePath:      "src/draft/conformance-port-suite-contract/src/conformance-port-suite.ts"
	packageName:     "conformance-port-suite-contract"
	domain:          "conformance-port-suite"
}

#ConnectivityCostFeedbackContractConnectivityCostFeedbackDataModel: #DataModel & {
	contractId:      "hobo.datamodel.connectivity-cost-feedback-contract.connectivity-cost-feedback"
	protobufMessage: "ConnectivityCostFeedbackContractConnectivityCostFeedbackDataModel"
	sourcePath:      "src/draft/connectivity-cost-feedback-contract/src/connectivity-cost-feedback.ts"
	packageName:     "connectivity-cost-feedback-contract"
	domain:          "connectivity-cost-feedback"
}

#ConnectivityPolicyEnforcementContractConnectivityPolicyEnforcementDataModel: #DataModel & {
	contractId:      "hobo.datamodel.connectivity-policy-enforcement-contract.connectivity-policy-enforcement"
	protobufMessage: "ConnectivityPolicyEnforcementContractConnectivityPolicyEnforcementDataModel"
	sourcePath:      "src/draft/connectivity-policy-enforcement-contract/src/connectivity-policy-enforcement.ts"
	packageName:     "connectivity-policy-enforcement-contract"
	domain:          "connectivity-policy-enforcement"
}

#ConnectivityTierIrContractConnectivityTierIrDataModel: #DataModel & {
	contractId:      "hobo.datamodel.connectivity-tier-ir-contract.connectivity-tier-ir"
	protobufMessage: "ConnectivityTierIrContractConnectivityTierIrDataModel"
	sourcePath:      "src/draft/connectivity-tier-ir-contract/src/connectivity-tier-ir.ts"
	packageName:     "connectivity-tier-ir-contract"
	domain:          "connectivity-tier-ir"
}

#ContractEnginePortContractContractEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.contract-engine-port-contract.contract-engine"
	protobufMessage: "ContractEnginePortContractContractEngineDataModel"
	sourcePath:      "src/draft/contract-engine-port-contract/src/contract-engine.ts"
	packageName:     "contract-engine-port-contract"
	domain:          "contract-engine-port"
}

#ControlPlaneActionTaxonomyContractControlPlaneActionTaxonomyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.control-plane-action-taxonomy-contract.control-plane-action-taxonomy"
	protobufMessage: "ControlPlaneActionTaxonomyContractControlPlaneActionTaxonomyDataModel"
	sourcePath:      "src/draft/control-plane-action-taxonomy-contract/src/control-plane-action-taxonomy.ts"
	packageName:     "control-plane-action-taxonomy-contract"
	domain:          "control-plane-action-taxonomy"
}

#ControlPlaneAuthzCacheContractControlPlaneAuthzCacheDataModel: #DataModel & {
	contractId:      "hobo.datamodel.control-plane-authz-cache-contract.control-plane-authz-cache"
	protobufMessage: "ControlPlaneAuthzCacheContractControlPlaneAuthzCacheDataModel"
	sourcePath:      "src/draft/control-plane-authz-cache-contract/src/control-plane-authz-cache.ts"
	packageName:     "control-plane-authz-cache-contract"
	domain:          "control-plane-authz-cache"
}

#ControlPlaneEventSchemaContractControlPlaneEventsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.control-plane-event-schema-contract.control-plane-events"
	protobufMessage: "ControlPlaneEventSchemaContractControlPlaneEventsDataModel"
	sourcePath:      "src/draft/control-plane-event-schema-contract/src/control-plane-events.ts"
	packageName:     "control-plane-event-schema-contract"
	domain:          "control-plane-event-schema"
}

#ControlPlanePolicyBypassGuardControlPlanePolicyBypassGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.control-plane-policy-bypass-guard.control-plane-policy-bypass-guard"
	protobufMessage: "ControlPlanePolicyBypassGuardControlPlanePolicyBypassGuardDataModel"
	sourcePath:      "src/draft/control-plane-policy-bypass-guard/src/control-plane-policy-bypass-guard.ts"
	packageName:     "control-plane-policy-bypass-guard"
	domain:          "control-plane-policy-bypass-guard"
}

#CostDegradationSagaContractCostDegradationSagaDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cost-degradation-saga-contract.cost-degradation-saga"
	protobufMessage: "CostDegradationSagaContractCostDegradationSagaDataModel"
	sourcePath:      "src/draft/cost-degradation-saga-contract/src/cost-degradation-saga.ts"
	packageName:     "cost-degradation-saga-contract"
	domain:          "cost-degradation-saga"
}

#CostRoutingEligibilityContractCostRoutingEligibilityDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cost-routing-eligibility-contract.cost-routing-eligibility"
	protobufMessage: "CostRoutingEligibilityContractCostRoutingEligibilityDataModel"
	sourcePath:      "src/draft/cost-routing-eligibility-contract/src/cost-routing-eligibility.ts"
	packageName:     "cost-routing-eligibility-contract"
	domain:          "cost-routing-eligibility"
}

#CostSignalContractCostSignalContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cost-signal-contract.cost-signal-contract"
	protobufMessage: "CostSignalContractCostSignalContractDataModel"
	sourcePath:      "src/draft/cost-signal-contract/src/cost-signal-contract.ts"
	packageName:     "cost-signal-contract"
	domain:          "cost-signal"
}

#CqrsCommandAggregateContractCqrsCommandAggregateContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cqrs-command-aggregate-contract.cqrs-command-aggregate-contract"
	protobufMessage: "CqrsCommandAggregateContractCqrsCommandAggregateContractDataModel"
	sourcePath:      "src/draft/cqrs-command-aggregate-contract/src/cqrs-command-aggregate-contract.ts"
	packageName:     "cqrs-command-aggregate-contract"
	domain:          "cqrs-command-aggregate"
}

#CreditLedgerViewContractCreditLedgerViewDataModel: #DataModel & {
	contractId:      "hobo.datamodel.credit-ledger-view-contract.credit-ledger-view"
	protobufMessage: "CreditLedgerViewContractCreditLedgerViewDataModel"
	sourcePath:      "src/draft/credit-ledger-view-contract/src/credit-ledger-view.ts"
	packageName:     "credit-ledger-view-contract"
	domain:          "credit-ledger-view"
}

#CrewEventContractCrewEventContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.crew-event-contract.crew-event-contract"
	protobufMessage: "CrewEventContractCrewEventContractDataModel"
	sourcePath:      "src/draft/crew-event-contract/src/crew-event-contract.ts"
	packageName:     "crew-event-contract"
	domain:          "crew-event"
}

#CrossCampBoundedStalenessContractCrossCampBoundedStalenessDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cross-camp-bounded-staleness-contract.cross-camp-bounded-staleness"
	protobufMessage: "CrossCampBoundedStalenessContractCrossCampBoundedStalenessDataModel"
	sourcePath:      "src/draft/cross-camp-bounded-staleness-contract/src/cross-camp-bounded-staleness.ts"
	packageName:     "cross-camp-bounded-staleness-contract"
	domain:          "cross-camp-bounded-staleness"
}

#CrossCampFlagStateConsistencyContractCrossCampFlagStateConsistencyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cross-camp-flag-state-consistency-contract.cross-camp-flag-state-consistency"
	protobufMessage: "CrossCampFlagStateConsistencyContractCrossCampFlagStateConsistencyDataModel"
	sourcePath:      "src/draft/cross-camp-flag-state-consistency-contract/src/cross-camp-flag-state-consistency.ts"
	packageName:     "cross-camp-flag-state-consistency-contract"
	domain:          "cross-camp-flag-state-consistency"
}

#CrossCampRoutingPolicyContractCrossCampRoutingPolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cross-camp-routing-policy-contract.cross-camp-routing-policy"
	protobufMessage: "CrossCampRoutingPolicyContractCrossCampRoutingPolicyDataModel"
	sourcePath:      "src/draft/cross-camp-routing-policy-contract/src/cross-camp-routing-policy.ts"
	packageName:     "cross-camp-routing-policy-contract"
	domain:          "cross-camp-routing-policy"
}

#CrossCloudEquivalenceModelResolverDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cross-cloud-equivalence-model.resolver"
	protobufMessage: "CrossCloudEquivalenceModelResolverDataModel"
	sourcePath:      "src/draft/cross-cloud-equivalence-model/src/resolver.ts"
	packageName:     "cross-cloud-equivalence-model"
	domain:          "cross-cloud-equivalence-model"
}

#CrossLayerGeneratedStackPropagationContractCrossLayerGeneratedStackPropagationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cross-layer-generated-stack-propagation-contract.cross-layer-generated-stack-propagation"
	protobufMessage: "CrossLayerGeneratedStackPropagationContractCrossLayerGeneratedStackPropagationDataModel"
	sourcePath:      "src/draft/cross-layer-generated-stack-propagation-contract/src/cross-layer-generated-stack-propagation.ts"
	packageName:     "cross-layer-generated-stack-propagation-contract"
	domain:          "cross-layer-generated-stack-propagation"
}

#CrossYardPolicyAttestationContractCrossYardPolicyAttestationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.cross-yard-policy-attestation-contract.cross-yard-policy-attestation"
	protobufMessage: "CrossYardPolicyAttestationContractCrossYardPolicyAttestationDataModel"
	sourcePath:      "src/draft/cross-yard-policy-attestation-contract/src/cross-yard-policy-attestation.ts"
	packageName:     "cross-yard-policy-attestation-contract"
	domain:          "cross-yard-policy-attestation"
}

#CryptoShredErasureContractCryptoShredErasureContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.crypto-shred-erasure-contract.crypto-shred-erasure-contract"
	protobufMessage: "CryptoShredErasureContractCryptoShredErasureContractDataModel"
	sourcePath:      "src/draft/crypto-shred-erasure-contract/src/crypto-shred-erasure-contract.ts"
	packageName:     "crypto-shred-erasure-contract"
	domain:          "crypto-shred-erasure"
}

#CuratedCatalogPolicyContractCuratedCatalogPolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.curated-catalog-policy-contract.curated-catalog-policy"
	protobufMessage: "CuratedCatalogPolicyContractCuratedCatalogPolicyDataModel"
	sourcePath:      "src/draft/curated-catalog-policy-contract/src/curated-catalog-policy.ts"
	packageName:     "curated-catalog-policy-contract"
	domain:          "curated-catalog-policy"
}

#DataFlywheelPrivacySpikePrivacyModelDataModel: #DataModel & {
	contractId:      "hobo.datamodel.data-flywheel-privacy-spike.privacy-model"
	protobufMessage: "DataFlywheelPrivacySpikePrivacyModelDataModel"
	sourcePath:      "src/draft/data-flywheel-privacy-spike/src/privacy-model.ts"
	packageName:     "data-flywheel-privacy-spike"
	domain:          "data-flywheel-privacy"
}

#DataGovernancePolicyContractDataGovernancePolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.data-governance-policy-contract.data-governance-policy"
	protobufMessage: "DataGovernancePolicyContractDataGovernancePolicyDataModel"
	sourcePath:      "src/draft/data-governance-policy-contract/src/data-governance-policy.ts"
	packageName:     "data-governance-policy-contract"
	domain:          "data-governance-policy"
}

#DataParadigmAuthoringContractDataParadigmAuthoringDataModel: #DataModel & {
	contractId:      "hobo.datamodel.data-paradigm-authoring-contract.data-paradigm-authoring"
	protobufMessage: "DataParadigmAuthoringContractDataParadigmAuthoringDataModel"
	sourcePath:      "src/draft/data-paradigm-authoring-contract/src/data-paradigm-authoring.ts"
	packageName:     "data-paradigm-authoring-contract"
	domain:          "data-paradigm-authoring"
}

#DefaultReadSurfaceContractDefaultReadSurfaceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.default-read-surface-contract.default-read-surface"
	protobufMessage: "DefaultReadSurfaceContractDefaultReadSurfaceDataModel"
	sourcePath:      "src/draft/default-read-surface-contract/src/default-read-surface.ts"
	packageName:     "default-read-surface-contract"
	domain:          "default-read-surface"
}

#DefaultRoleActionMatrixContractDefaultRoleActionMatrixDataModel: #DataModel & {
	contractId:      "hobo.datamodel.default-role-action-matrix-contract.default-role-action-matrix"
	protobufMessage: "DefaultRoleActionMatrixContractDefaultRoleActionMatrixDataModel"
	sourcePath:      "src/draft/default-role-action-matrix-contract/src/default-role-action-matrix.ts"
	packageName:     "default-role-action-matrix-contract"
	domain:          "default-role-action-matrix"
}

#DeliveryExperimentAdapterConformanceSuiteHarnessAdapterConformanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.delivery-experiment-adapter-conformance-suite.harness-adapter-conformance"
	protobufMessage: "DeliveryExperimentAdapterConformanceSuiteHarnessAdapterConformanceDataModel"
	sourcePath:      "src/draft/delivery-experiment-adapter-conformance-suite/src/harness-adapter-conformance.ts"
	packageName:     "delivery-experiment-adapter-conformance-suite"
	domain:          "delivery-experiment-adapter-conformance"
}

#DeliveryOrchestratorSkeletonContractDeliveryOrchestratorDataModel: #DataModel & {
	contractId:      "hobo.datamodel.delivery-orchestrator-skeleton-contract.delivery-orchestrator"
	protobufMessage: "DeliveryOrchestratorSkeletonContractDeliveryOrchestratorDataModel"
	sourcePath:      "src/draft/delivery-orchestrator-skeleton-contract/src/delivery-orchestrator.ts"
	packageName:     "delivery-orchestrator-skeleton-contract"
	domain:          "delivery-orchestrator-skeleton"
}

#DeltaSetApplyReconcileContractDeltaSetApplyReconcileDataModel: #DataModel & {
	contractId:      "hobo.datamodel.delta-set-apply-reconcile-contract.delta-set-apply-reconcile"
	protobufMessage: "DeltaSetApplyReconcileContractDeltaSetApplyReconcileDataModel"
	sourcePath:      "src/draft/delta-set-apply-reconcile-contract/src/delta-set-apply-reconcile.ts"
	packageName:     "delta-set-apply-reconcile-contract"
	domain:          "delta-set-apply-reconcile"
}

#DenyCeilingAlgebraPocDenyCeilingAlgebraDataModel: #DataModel & {
	contractId:      "hobo.datamodel.deny-ceiling-algebra-poc.deny-ceiling-algebra"
	protobufMessage: "DenyCeilingAlgebraPocDenyCeilingAlgebraDataModel"
	sourcePath:      "src/draft/deny-ceiling-algebra-poc/src/deny-ceiling-algebra.ts"
	packageName:     "deny-ceiling-algebra-poc"
	domain:          "deny-ceiling-algebra"
}

#DeploymentPlanIrContractDeploymentPlanIrDataModel: #DataModel & {
	contractId:      "hobo.datamodel.deployment-plan-ir-contract.deployment-plan-ir"
	protobufMessage: "DeploymentPlanIrContractDeploymentPlanIrDataModel"
	sourcePath:      "src/draft/deployment-plan-ir-contract/src/deployment-plan-ir.ts"
	packageName:     "deployment-plan-ir-contract"
	domain:          "deployment-plan-ir"
}

#DeploymentStrategySagaTemplatesContractDeploymentStrategySagaTemplatesDataModel: #DataModel & {
	contractId:      "hobo.datamodel.deployment-strategy-saga-templates-contract.deployment-strategy-saga-templates"
	protobufMessage: "DeploymentStrategySagaTemplatesContractDeploymentStrategySagaTemplatesDataModel"
	sourcePath:      "src/draft/deployment-strategy-saga-templates-contract/src/deployment-strategy-saga-templates.ts"
	packageName:     "deployment-strategy-saga-templates-contract"
	domain:          "deployment-strategy-saga-templates"
}

#DeploymentViewSagaGraphContractDeploymentViewDataModel: #DataModel & {
	contractId:      "hobo.datamodel.deployment-view-saga-graph-contract.deployment-view"
	protobufMessage: "DeploymentViewSagaGraphContractDeploymentViewDataModel"
	sourcePath:      "src/draft/deployment-view-saga-graph-contract/src/deployment-view.ts"
	packageName:     "deployment-view-saga-graph-contract"
	domain:          "deployment-view-saga-graph"
}

#DevopsCanaryRolloutJourneyContractDevopsCanaryRolloutJourneyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.devops-canary-rollout-journey-contract.devops-canary-rollout-journey"
	protobufMessage: "DevopsCanaryRolloutJourneyContractDevopsCanaryRolloutJourneyDataModel"
	sourcePath:      "src/draft/devops-canary-rollout-journey-contract/src/devops-canary-rollout-journey.ts"
	packageName:     "devops-canary-rollout-journey-contract"
	domain:          "devops-canary-rollout-journey"
}

#DevopsSelfHostYardJourneyContractDevopsSelfHostYardJourneyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.devops-self-host-yard-journey-contract.devops-self-host-yard-journey"
	protobufMessage: "DevopsSelfHostYardJourneyContractDevopsSelfHostYardJourneyDataModel"
	sourcePath:      "src/draft/devops-self-host-yard-journey-contract/src/devops-self-host-yard-journey.ts"
	packageName:     "devops-self-host-yard-journey-contract"
	domain:          "devops-self-host-yard-journey"
}

#DisasterRecoveryFailoverContractDisasterRecoveryFailoverDataModel: #DataModel & {
	contractId:      "hobo.datamodel.disaster-recovery-failover-contract.disaster-recovery-failover"
	protobufMessage: "DisasterRecoveryFailoverContractDisasterRecoveryFailoverDataModel"
	sourcePath:      "src/draft/disaster-recovery-failover-contract/src/disaster-recovery-failover.ts"
	packageName:     "disaster-recovery-failover-contract"
	domain:          "disaster-recovery-failover"
}

#DispatcherMaximizeCreditsContractDispatcherDataModel: #DataModel & {
	contractId:      "hobo.datamodel.dispatcher-maximize-credits-contract.dispatcher"
	protobufMessage: "DispatcherMaximizeCreditsContractDispatcherDataModel"
	sourcePath:      "src/draft/dispatcher-maximize-credits-contract/src/dispatcher.ts"
	packageName:     "dispatcher-maximize-credits-contract"
	domain:          "dispatcher-maximize-credits"
}

#DistributedArtifactResolverContractDistributedArtifactResolverDataModel: #DataModel & {
	contractId:      "hobo.datamodel.distributed-artifact-resolver-contract.distributed-artifact-resolver"
	protobufMessage: "DistributedArtifactResolverContractDistributedArtifactResolverDataModel"
	sourcePath:      "src/draft/distributed-artifact-resolver-contract/src/distributed-artifact-resolver.ts"
	packageName:     "distributed-artifact-resolver-contract"
	domain:          "distributed-artifact-resolver"
}

#DistributedArtifactVersionPolicyVersionPolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.distributed-artifact-version-policy.version-policy"
	protobufMessage: "DistributedArtifactVersionPolicyVersionPolicyDataModel"
	sourcePath:      "src/draft/distributed-artifact-version-policy/src/version-policy.ts"
	packageName:     "distributed-artifact-version-policy"
	domain:          "distributed-artifact-version-policy"
}

#DnsValidationGateThreatModelThreatModelDataModel: #DataModel & {
	contractId:      "hobo.datamodel.dns-validation-gate-threat-model.threat-model"
	protobufMessage: "DnsValidationGateThreatModelThreatModelDataModel"
	sourcePath:      "src/draft/dns-validation-gate-threat-model/src/threat-model.ts"
	packageName:     "dns-validation-gate-threat-model"
	domain:          "dns-validation-gate-threat-model"
}

#DnsValidationRebindingGuardContractDnsValidationRebindingGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.dns-validation-rebinding-guard-contract.dns-validation-rebinding-guard"
	protobufMessage: "DnsValidationRebindingGuardContractDnsValidationRebindingGuardDataModel"
	sourcePath:      "src/draft/dns-validation-rebinding-guard-contract/src/dns-validation-rebinding-guard.ts"
	packageName:     "dns-validation-rebinding-guard-contract"
	domain:          "dns-validation-rebinding-guard"
}

#DocumentProjectionSinkContractDocumentProjectionSinkDataModel: #DataModel & {
	contractId:      "hobo.datamodel.document-projection-sink-contract.document-projection-sink"
	protobufMessage: "DocumentProjectionSinkContractDocumentProjectionSinkDataModel"
	sourcePath:      "src/draft/document-projection-sink-contract/src/document-projection-sink.ts"
	packageName:     "document-projection-sink-contract"
	domain:          "document-projection-sink"
}

#DomainCutoverSagaContractDomainCutoverSagaDataModel: #DataModel & {
	contractId:      "hobo.datamodel.domain-cutover-saga-contract.domain-cutover-saga"
	protobufMessage: "DomainCutoverSagaContractDomainCutoverSagaDataModel"
	sourcePath:      "src/draft/domain-cutover-saga-contract/src/domain-cutover-saga.ts"
	packageName:     "domain-cutover-saga-contract"
	domain:          "domain-cutover-saga"
}

#DomainEventBodyContractDomainEventBodyContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.domain-event-body-contract.domain-event-body-contract"
	protobufMessage: "DomainEventBodyContractDomainEventBodyContractDataModel"
	sourcePath:      "src/draft/domain-event-body-contract/src/domain-event-body-contract.ts"
	packageName:     "domain-event-body-contract"
	domain:          "domain-event-body"
}

#DomainValidationGateContractDomainValidationGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.domain-validation-gate-contract.domain-validation-gate"
	protobufMessage: "DomainValidationGateContractDomainValidationGateDataModel"
	sourcePath:      "src/draft/domain-validation-gate-contract/src/domain-validation-gate.ts"
	packageName:     "domain-validation-gate-contract"
	domain:          "domain-validation-gate"
}

#DrFailoverIntegrityContractDrFailoverIntegrityDataModel: #DataModel & {
	contractId:      "hobo.datamodel.dr-failover-integrity-contract.dr-failover-integrity"
	protobufMessage: "DrFailoverIntegrityContractDrFailoverIntegrityDataModel"
	sourcePath:      "src/draft/dr-failover-integrity-contract/src/dr-failover-integrity.ts"
	packageName:     "dr-failover-integrity-contract"
	domain:          "dr-failover-integrity"
}

#DriftDetectionLoopContractDriftDetectionLoopDataModel: #DataModel & {
	contractId:      "hobo.datamodel.drift-detection-loop-contract.drift-detection-loop"
	protobufMessage: "DriftDetectionLoopContractDriftDetectionLoopDataModel"
	sourcePath:      "src/draft/drift-detection-loop-contract/src/drift-detection-loop.ts"
	packageName:     "drift-detection-loop-contract"
	domain:          "drift-detection-loop"
}

#DriftOrphanSweepContractDriftOrphanSweepDataModel: #DataModel & {
	contractId:      "hobo.datamodel.drift-orphan-sweep-contract.drift-orphan-sweep"
	protobufMessage: "DriftOrphanSweepContractDriftOrphanSweepDataModel"
	sourcePath:      "src/draft/drift-orphan-sweep-contract/src/drift-orphan-sweep.ts"
	packageName:     "drift-orphan-sweep-contract"
	domain:          "drift-orphan-sweep"
}

#DriverDispatchRoutingContractDriverDispatchRoutingDataModel: #DataModel & {
	contractId:      "hobo.datamodel.driver-dispatch-routing-contract.driver-dispatch-routing"
	protobufMessage: "DriverDispatchRoutingContractDriverDispatchRoutingDataModel"
	sourcePath:      "src/draft/driver-dispatch-routing-contract/src/driver-dispatch-routing.ts"
	packageName:     "driver-dispatch-routing-contract"
	domain:          "driver-dispatch-routing"
}

#EndUserAuthorizationPolicyContractEndUserAuthorizationPolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.end-user-authorization-policy-contract.end-user-authorization-policy"
	protobufMessage: "EndUserAuthorizationPolicyContractEndUserAuthorizationPolicyDataModel"
	sourcePath:      "src/draft/end-user-authorization-policy-contract/src/end-user-authorization-policy.ts"
	packageName:     "end-user-authorization-policy-contract"
	domain:          "end-user-authorization-policy"
}

#EndpointMonitorOperatorContractEndpointMonitorOperatorDataModel: #DataModel & {
	contractId:      "hobo.datamodel.endpoint-monitor-operator-contract.endpoint-monitor-operator"
	protobufMessage: "EndpointMonitorOperatorContractEndpointMonitorOperatorDataModel"
	sourcePath:      "src/draft/endpoint-monitor-operator-contract/src/endpoint-monitor-operator.ts"
	packageName:     "endpoint-monitor-operator-contract"
	domain:          "endpoint-monitor-operator"
}

#ErrorBudgetDeployGateContractErrorBudgetDeployGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.error-budget-deploy-gate-contract.error-budget-deploy-gate"
	protobufMessage: "ErrorBudgetDeployGateContractErrorBudgetDeployGateDataModel"
	sourcePath:      "src/draft/error-budget-deploy-gate-contract/src/error-budget-deploy-gate.ts"
	packageName:     "error-budget-deploy-gate-contract"
	domain:          "error-budget-deploy-gate"
}

#EvalPromotionGateContractEvalPromotionGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.eval-promotion-gate-contract.eval-promotion-gate"
	protobufMessage: "EvalPromotionGateContractEvalPromotionGateDataModel"
	sourcePath:      "src/draft/eval-promotion-gate-contract/src/eval-promotion-gate.ts"
	packageName:     "eval-promotion-gate-contract"
	domain:          "eval-promotion-gate"
}

#EventBodyUpcasterGateEventBodyUpcasterGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.event-body-upcaster-gate.event-body-upcaster-gate"
	protobufMessage: "EventBodyUpcasterGateEventBodyUpcasterGateDataModel"
	sourcePath:      "src/draft/event-body-upcaster-gate/src/event-body-upcaster-gate.ts"
	packageName:     "event-body-upcaster-gate"
	domain:          "event-body-upcaster-gate"
}

#ExampleAppsScopeAcceptanceExampleAppsScopeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.example-apps-scope-acceptance.example-apps-scope"
	protobufMessage: "ExampleAppsScopeAcceptanceExampleAppsScopeDataModel"
	sourcePath:      "src/draft/example-apps-scope-acceptance/src/example-apps-scope.ts"
	packageName:     "example-apps-scope-acceptance"
	domain:          "example-apps-scope-acceptance"
}

#ExecutionHostProviderContractExecutionHostProviderDataModel: #DataModel & {
	contractId:      "hobo.datamodel.execution-host-provider-contract.execution-host-provider"
	protobufMessage: "ExecutionHostProviderContractExecutionHostProviderDataModel"
	sourcePath:      "src/draft/execution-host-provider-contract/src/execution-host-provider.ts"
	packageName:     "execution-host-provider-contract"
	domain:          "execution-host-provider"
}

#ExecutorSkeletonContractExecutorSkeletonDataModel: #DataModel & {
	contractId:      "hobo.datamodel.executor-skeleton-contract.executor-skeleton"
	protobufMessage: "ExecutorSkeletonContractExecutorSkeletonDataModel"
	sourcePath:      "src/draft/executor-skeleton-contract/src/executor-skeleton.ts"
	packageName:     "executor-skeleton-contract"
	domain:          "executor-skeleton"
}

#ExperimentStatisticalAnalysisContractExperimentStatisticalAnalysisDataModel: #DataModel & {
	contractId:      "hobo.datamodel.experiment-statistical-analysis-contract.experiment-statistical-analysis"
	protobufMessage: "ExperimentStatisticalAnalysisContractExperimentStatisticalAnalysisDataModel"
	sourcePath:      "src/draft/experiment-statistical-analysis-contract/src/experiment-statistical-analysis.ts"
	packageName:     "experiment-statistical-analysis-contract"
	domain:          "experiment-statistical-analysis"
}

#FailureTaxonomySafeFixClassifierFailureTaxonomyClassifierDataModel: #DataModel & {
	contractId:      "hobo.datamodel.failure-taxonomy-safe-fix-classifier.failure-taxonomy-classifier"
	protobufMessage: "FailureTaxonomySafeFixClassifierFailureTaxonomyClassifierDataModel"
	sourcePath:      "src/draft/failure-taxonomy-safe-fix-classifier/src/failure-taxonomy-classifier.ts"
	packageName:     "failure-taxonomy-safe-fix-classifier"
	domain:          "failure-taxonomy-safe-fix-classifier"
}

#FeatureFlagGovernanceContractFeatureFlagGovernanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.feature-flag-governance-contract.feature-flag-governance"
	protobufMessage: "FeatureFlagGovernanceContractFeatureFlagGovernanceDataModel"
	sourcePath:      "src/draft/feature-flag-governance-contract/src/feature-flag-governance.ts"
	packageName:     "feature-flag-governance-contract"
	domain:          "feature-flag-governance"
}

#FederatedPolicyPackConflictContractFederatedPolicyPackConflictDataModel: #DataModel & {
	contractId:      "hobo.datamodel.federated-policy-pack-conflict-contract.federated-policy-pack-conflict"
	protobufMessage: "FederatedPolicyPackConflictContractFederatedPolicyPackConflictDataModel"
	sourcePath:      "src/draft/federated-policy-pack-conflict-contract/src/federated-policy-pack-conflict.ts"
	packageName:     "federated-policy-pack-conflict-contract"
	domain:          "federated-policy-pack-conflict"
}

#FlagDebtAutoCleanupContractFlagDebtAutoCleanupDataModel: #DataModel & {
	contractId:      "hobo.datamodel.flag-debt-auto-cleanup-contract.flag-debt-auto-cleanup"
	protobufMessage: "FlagDebtAutoCleanupContractFlagDebtAutoCleanupDataModel"
	sourcePath:      "src/draft/flag-debt-auto-cleanup-contract/src/flag-debt-auto-cleanup.ts"
	packageName:     "flag-debt-auto-cleanup-contract"
	domain:          "flag-debt-auto-cleanup"
}

#FlagEventContractFlagEventContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.flag-event-contract.flag-event-contract"
	protobufMessage: "FlagEventContractFlagEventContractDataModel"
	sourcePath:      "src/draft/flag-event-contract/src/flag-event-contract.ts"
	packageName:     "flag-event-contract"
	domain:          "flag-event"
}

#FlagPartitionConsistencyContractFlagPartitionConsistencyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.flag-partition-consistency-contract.flag-partition-consistency"
	protobufMessage: "FlagPartitionConsistencyContractFlagPartitionConsistencyDataModel"
	sourcePath:      "src/draft/flag-partition-consistency-contract/src/flag-partition-consistency.ts"
	packageName:     "flag-partition-consistency-contract"
	domain:          "flag-partition-consistency"
}

#FlagRulesetSyncContractFlagRulesetSyncDataModel: #DataModel & {
	contractId:      "hobo.datamodel.flag-ruleset-sync-contract.flag-ruleset-sync"
	protobufMessage: "FlagRulesetSyncContractFlagRulesetSyncDataModel"
	sourcePath:      "src/draft/flag-ruleset-sync-contract/src/flag-ruleset-sync.ts"
	packageName:     "flag-ruleset-sync-contract"
	domain:          "flag-ruleset-sync"
}

#FullTextSearchContractFullTextSearchContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.full-text-search-contract.full-text-search-contract"
	protobufMessage: "FullTextSearchContractFullTextSearchContractDataModel"
	sourcePath:      "src/draft/full-text-search-contract/src/full-text-search-contract.ts"
	packageName:     "full-text-search-contract"
	domain:          "full-text-search"
}

#GatedAutonomousRemediationContractGatedAutonomousRemediationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.gated-autonomous-remediation-contract.gated-autonomous-remediation"
	protobufMessage: "GatedAutonomousRemediationContractGatedAutonomousRemediationDataModel"
	sourcePath:      "src/draft/gated-autonomous-remediation-contract/src/gated-autonomous-remediation.ts"
	packageName:     "gated-autonomous-remediation-contract"
	domain:          "gated-autonomous-remediation"
}

#GatekeeperVerifyContractGatekeeperVerifyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.gatekeeper-verify-contract.gatekeeper-verify"
	protobufMessage: "GatekeeperVerifyContractGatekeeperVerifyDataModel"
	sourcePath:      "src/draft/gatekeeper-verify-contract/src/gatekeeper-verify.ts"
	packageName:     "gatekeeper-verify-contract"
	domain:          "gatekeeper-verify"
}

#GatewayRealizationContractGatewayRealizationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.gateway-realization-contract.gateway-realization"
	protobufMessage: "GatewayRealizationContractGatewayRealizationDataModel"
	sourcePath:      "src/draft/gateway-realization-contract/src/gateway-realization.ts"
	packageName:     "gateway-realization-contract"
	domain:          "gateway-realization"
}

#GenerateproviderCorrectnessSpikeCorrectnessSpikeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generateprovider-correctness-spike.correctness-spike"
	protobufMessage: "GenerateproviderCorrectnessSpikeCorrectnessSpikeDataModel"
	sourcePath:      "src/draft/generateprovider-correctness-spike/src/correctness-spike.ts"
	packageName:     "generateprovider-correctness-spike"
	domain:          "generateprovider-correctness"
}

#GenerationBoundedRepairLoopContractBoundedRepairLoopDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-bounded-repair-loop-contract.bounded-repair-loop"
	protobufMessage: "GenerationBoundedRepairLoopContractBoundedRepairLoopDataModel"
	sourcePath:      "src/draft/generation-bounded-repair-loop-contract/src/bounded-repair-loop.ts"
	packageName:     "generation-bounded-repair-loop-contract"
	domain:          "generation-bounded-repair-loop"
}

#GenerationCertifyStageContractCertifyStageDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-certify-stage-contract.certify-stage"
	protobufMessage: "GenerationCertifyStageContractCertifyStageDataModel"
	sourcePath:      "src/draft/generation-certify-stage-contract/src/certify-stage.ts"
	packageName:     "generation-certify-stage-contract"
	domain:          "generation-certify-stage"
}

#GenerationEvalMethodologySpikeMethodologyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-eval-methodology-spike.methodology"
	protobufMessage: "GenerationEvalMethodologySpikeMethodologyDataModel"
	sourcePath:      "src/draft/generation-eval-methodology-spike/src/methodology.ts"
	packageName:     "generation-eval-methodology-spike"
	domain:          "generation-eval-methodology"
}

#GenerationLlmFillContractFillDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-llm-fill-contract.fill"
	protobufMessage: "GenerationLlmFillContractFillDataModel"
	sourcePath:      "src/draft/generation-llm-fill-contract/src/fill.ts"
	packageName:     "generation-llm-fill-contract"
	domain:          "generation-llm-fill"
}

#GenerationMaterialSanitizationContractMaterialSanitizationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-material-sanitization-contract.material-sanitization"
	protobufMessage: "GenerationMaterialSanitizationContractMaterialSanitizationDataModel"
	sourcePath:      "src/draft/generation-material-sanitization-contract/src/material-sanitization.ts"
	packageName:     "generation-material-sanitization-contract"
	domain:          "generation-material-sanitization"
}

#GenerationPipelineIoContractContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-pipeline-io-contract.contract"
	protobufMessage: "GenerationPipelineIoContractContractDataModel"
	sourcePath:      "src/draft/generation-pipeline-io-contract/src/contract.ts"
	packageName:     "generation-pipeline-io-contract"
	domain:          "generation-pipeline-io"
}

#GenerationPromotionPolicyGateContractPromotionGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-promotion-policy-gate-contract.promotion-gate"
	protobufMessage: "GenerationPromotionPolicyGateContractPromotionGateDataModel"
	sourcePath:      "src/draft/generation-promotion-policy-gate-contract/src/promotion-gate.ts"
	packageName:     "generation-promotion-policy-gate-contract"
	domain:          "generation-promotion-policy-gate"
}

#GenerationProviderLoopContractGenerateProviderDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-provider-loop-contract.generate-provider"
	protobufMessage: "GenerationProviderLoopContractGenerateProviderDataModel"
	sourcePath:      "src/draft/generation-provider-loop-contract/src/generate-provider.ts"
	packageName:     "generation-provider-loop-contract"
	domain:          "generation-provider-loop"
}

#GenerationReferenceRunContractGenerationReferenceRunDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-reference-run-contract.generation-reference-run"
	protobufMessage: "GenerationReferenceRunContractGenerationReferenceRunDataModel"
	sourcePath:      "src/draft/generation-reference-run-contract/src/generation-reference-run.ts"
	packageName:     "generation-reference-run-contract"
	domain:          "generation-reference-run"
}

#GenerationSafetyGateContractSafetyGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-safety-gate-contract.safety-gate"
	protobufMessage: "GenerationSafetyGateContractSafetyGateDataModel"
	sourcePath:      "src/draft/generation-safety-gate-contract/src/safety-gate.ts"
	packageName:     "generation-safety-gate-contract"
	domain:          "generation-safety-gate"
}

#GenerationScaffoldStageContractScaffoldDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-scaffold-stage-contract.scaffold"
	protobufMessage: "GenerationScaffoldStageContractScaffoldDataModel"
	sourcePath:      "src/draft/generation-scaffold-stage-contract/src/scaffold.ts"
	packageName:     "generation-scaffold-stage-contract"
	domain:          "generation-scaffold-stage"
}

#GenerationValidationStageContractValidationStageDataModel: #DataModel & {
	contractId:      "hobo.datamodel.generation-validation-stage-contract.validation-stage"
	protobufMessage: "GenerationValidationStageContractValidationStageDataModel"
	sourcePath:      "src/draft/generation-validation-stage-contract/src/validation-stage.ts"
	packageName:     "generation-validation-stage-contract"
	domain:          "generation-validation-stage"
}

#GenesisBreakglassContractGenesisBreakglassDataModel: #DataModel & {
	contractId:      "hobo.datamodel.genesis-breakglass-contract.genesis-breakglass"
	protobufMessage: "GenesisBreakglassContractGenesisBreakglassDataModel"
	sourcePath:      "src/draft/genesis-breakglass-contract/src/genesis-breakglass.ts"
	packageName:     "genesis-breakglass-contract"
	domain:          "genesis-breakglass"
}

#GitopsCiJourneyContractGitopsCiJourneyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.gitops-ci-journey-contract.gitops-ci-journey"
	protobufMessage: "GitopsCiJourneyContractGitopsCiJourneyDataModel"
	sourcePath:      "src/draft/gitops-ci-journey-contract/src/gitops-ci-journey.ts"
	packageName:     "gitops-ci-journey-contract"
	domain:          "gitops-ci-journey"
}

#GoldenSuiteChaosVerificationContractGoldenSuiteChaosVerificationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.golden-suite-chaos-verification-contract.golden-suite-chaos-verification"
	protobufMessage: "GoldenSuiteChaosVerificationContractGoldenSuiteChaosVerificationDataModel"
	sourcePath:      "src/draft/golden-suite-chaos-verification-contract/src/golden-suite-chaos-verification.ts"
	packageName:     "golden-suite-chaos-verification-contract"
	domain:          "golden-suite-chaos-verification"
}

#GovernanceConformanceSuiteContractGovernanceConformanceSuiteDataModel: #DataModel & {
	contractId:      "hobo.datamodel.governance-conformance-suite-contract.governance-conformance-suite"
	protobufMessage: "GovernanceConformanceSuiteContractGovernanceConformanceSuiteDataModel"
	sourcePath:      "src/draft/governance-conformance-suite-contract/src/governance-conformance-suite.ts"
	packageName:     "governance-conformance-suite-contract"
	domain:          "governance-conformance-suite"
}

#GraphqlFacadeGenerationPocGraphqlFacadeGeneratorDataModel: #DataModel & {
	contractId:      "hobo.datamodel.graphql-facade-generation-poc.graphql-facade-generator"
	protobufMessage: "GraphqlFacadeGenerationPocGraphqlFacadeGeneratorDataModel"
	sourcePath:      "src/draft/graphql-facade-generation-poc/src/graphql-facade-generator.ts"
	packageName:     "graphql-facade-generation-poc"
	domain:          "graphql-facade-generation"
}

#GraphqlFacadeRuntimeContractGraphqlFacadeRuntimeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.graphql-facade-runtime-contract.graphql-facade-runtime"
	protobufMessage: "GraphqlFacadeRuntimeContractGraphqlFacadeRuntimeDataModel"
	sourcePath:      "src/draft/graphql-facade-runtime-contract/src/graphql-facade-runtime.ts"
	packageName:     "graphql-facade-runtime-contract"
	domain:          "graphql-facade-runtime"
}

#GuardrailPolicyGateContractGuardrailPolicyGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.guardrail-policy-gate-contract.guardrail-policy-gate"
	protobufMessage: "GuardrailPolicyGateContractGuardrailPolicyGateDataModel"
	sourcePath:      "src/draft/guardrail-policy-gate-contract/src/guardrail-policy-gate.ts"
	packageName:     "guardrail-policy-gate-contract"
	domain:          "guardrail-policy-gate"
}

#HoboAddInstallVerificationContractHoboAddInstallVerificationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-add-install-verification-contract.hobo-add-install-verification"
	protobufMessage: "HoboAddInstallVerificationContractHoboAddInstallVerificationDataModel"
	sourcePath:      "src/draft/hobo-add-install-verification-contract/src/hobo-add-install-verification.ts"
	packageName:     "hobo-add-install-verification-contract"
	domain:          "hobo-add-install-verification"
}

#HoboAsyncBuildingBlockPortsContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-async-building-block-ports.contract"
	protobufMessage: "HoboAsyncBuildingBlockPortsContractDataModel"
	sourcePath:      "src/draft/hobo-async-building-block-ports/src/contract.ts"
	packageName:     "hobo-async-building-block-ports"
	domain:          "hobo-async-building-block-ports"
}

#HoboAuthAuthoringSurfaceAuthAuthoringSurfaceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-auth-authoring-surface.auth-authoring-surface"
	protobufMessage: "HoboAuthAuthoringSurfaceAuthAuthoringSurfaceDataModel"
	sourcePath:      "src/draft/hobo-auth-authoring-surface/src/auth-authoring-surface.ts"
	packageName:     "hobo-auth-authoring-surface"
	domain:          "hobo-auth-authoring-surface"
}

#HoboAuthConsumerContractAuthConsumerContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-auth-consumer-contract.auth-consumer-contract"
	protobufMessage: "HoboAuthConsumerContractAuthConsumerContractDataModel"
	sourcePath:      "src/draft/hobo-auth-consumer-contract/src/auth-consumer-contract.ts"
	packageName:     "hobo-auth-consumer-contract"
	domain:          "hobo-auth-consumer"
}

#HoboAuthFederateVerifyContractAuthFederateVerifyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-auth-federate-verify-contract.auth-federate-verify"
	protobufMessage: "HoboAuthFederateVerifyContractAuthFederateVerifyDataModel"
	sourcePath:      "src/draft/hobo-auth-federate-verify-contract/src/auth-federate-verify.ts"
	packageName:     "hobo-auth-federate-verify-contract"
	domain:          "hobo-auth-federate-verify"
}

#HoboAuthJsonContractAuthJsonDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-auth-json-contract.auth-json"
	protobufMessage: "HoboAuthJsonContractAuthJsonDataModel"
	sourcePath:      "src/draft/hobo-auth-json-contract/src/auth-json.ts"
	packageName:     "hobo-auth-json-contract"
	domain:          "hobo-auth-json"
}

#HoboBindlesResourceCatalogCatalogDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-bindles-resource-catalog.catalog"
	protobufMessage: "HoboBindlesResourceCatalogCatalogDataModel"
	sourcePath:      "src/draft/hobo-bindles-resource-catalog/src/catalog.ts"
	packageName:     "hobo-bindles-resource-catalog"
	domain:          "hobo-bindles-resource-catalog"
}

#HoboBuildCliContractBuildCliContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-build-cli-contract.build-cli-contract"
	protobufMessage: "HoboBuildCliContractBuildCliContractDataModel"
	sourcePath:      "src/draft/hobo-build-cli-contract/src/build-cli-contract.ts"
	packageName:     "hobo-build-cli-contract"
	domain:          "hobo-build-cli"
}

#HoboCliShellContractCliShellDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-cli-shell-contract.cli-shell"
	protobufMessage: "HoboCliShellContractCliShellDataModel"
	sourcePath:      "src/draft/hobo-cli-shell-contract/src/cli-shell.ts"
	packageName:     "hobo-cli-shell-contract"
	domain:          "hobo-cli-shell"
}

#HoboCodeDslContractHoboCodeDslDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-code-dsl-contract.hobo-code-dsl"
	protobufMessage: "HoboCodeDslContractHoboCodeDslDataModel"
	sourcePath:      "src/draft/hobo-code-dsl-contract/src/hobo-code-dsl.ts"
	packageName:     "hobo-code-dsl-contract"
	domain:          "hobo-code-dsl"
}

#HoboCodegenCliContractCodegenCliContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-codegen-cli-contract.codegen-cli-contract"
	protobufMessage: "HoboCodegenCliContractCodegenCliContractDataModel"
	sourcePath:      "src/draft/hobo-codegen-cli-contract/src/codegen-cli-contract.ts"
	packageName:     "hobo-codegen-cli-contract"
	domain:          "hobo-codegen-cli"
}

#HoboCollectCliContractCollectCliDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-collect-cli-contract.collect-cli"
	protobufMessage: "HoboCollectCliContractCollectCliDataModel"
	sourcePath:      "src/draft/hobo-collect-cli-contract/src/collect-cli.ts"
	packageName:     "hobo-collect-cli-contract"
	domain:          "hobo-collect-cli"
}

#HoboComponentizeContractComponentizeContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-componentize-contract.componentize-contract"
	protobufMessage: "HoboComponentizeContractComponentizeContractDataModel"
	sourcePath:      "src/draft/hobo-componentize-contract/src/componentize-contract.ts"
	packageName:     "hobo-componentize-contract"
	domain:          "hobo-componentize"
}

#HoboConfigSecretSchemaContractConfigSchemaDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-config-secret-schema-contract.config-schema"
	protobufMessage: "HoboConfigSecretSchemaContractConfigSchemaDataModel"
	sourcePath:      "src/draft/hobo-config-secret-schema-contract/src/config-schema.ts"
	packageName:     "hobo-config-secret-schema-contract"
	domain:          "hobo-config-secret-schema"
}

#HoboContractIrContractIrDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-contract-ir.contract-ir"
	protobufMessage: "HoboContractIrContractIrDataModel"
	sourcePath:      "src/draft/hobo-contract-ir/src/contract-ir.ts"
	packageName:     "hobo-contract-ir"
	domain:          "hobo-contract-ir"
}

#HoboCoreContractCoreContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-core-contract.core-contract"
	protobufMessage: "HoboCoreContractCoreContractDataModel"
	sourcePath:      "src/draft/hobo-core-contract/src/core-contract.ts"
	packageName:     "hobo-core-contract"
	domain:          "hobo-core"
}

#HoboDeliveryPortDeliveryContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-delivery-port.delivery-contract"
	protobufMessage: "HoboDeliveryPortDeliveryContractDataModel"
	sourcePath:      "src/draft/hobo-delivery-port/src/delivery-contract.ts"
	packageName:     "hobo-delivery-port"
	domain:          "hobo-delivery-port"
}

#HoboDevFidelityDriftContractDevFidelityDriftDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-dev-fidelity-drift-contract.dev-fidelity-drift"
	protobufMessage: "HoboDevFidelityDriftContractDevFidelityDriftDataModel"
	sourcePath:      "src/draft/hobo-dev-fidelity-drift-contract/src/dev-fidelity-drift.ts"
	packageName:     "hobo-dev-fidelity-drift-contract"
	domain:          "hobo-dev-fidelity-drift"
}

#HoboDevLoopContractDevLoopDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-dev-loop-contract.dev-loop"
	protobufMessage: "HoboDevLoopContractDevLoopDataModel"
	sourcePath:      "src/draft/hobo-dev-loop-contract/src/dev-loop.ts"
	packageName:     "hobo-dev-loop-contract"
	domain:          "hobo-dev-loop"
}

#HoboDnsPortContractDnsPortDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-dns-port-contract.dns-port"
	protobufMessage: "HoboDnsPortContractDnsPortDataModel"
	sourcePath:      "src/draft/hobo-dns-port-contract/src/dns-port.ts"
	packageName:     "hobo-dns-port-contract"
	domain:          "hobo-dns-port"
}

#HoboDoctorContractDoctorContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-doctor-contract.doctor-contract"
	protobufMessage: "HoboDoctorContractDoctorContractDataModel"
	sourcePath:      "src/draft/hobo-doctor-contract/src/doctor-contract.ts"
	packageName:     "hobo-doctor-contract"
	domain:          "hobo-doctor"
}

#HoboDownLifecycleContractDownLifecycleDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-down-lifecycle-contract.down-lifecycle"
	protobufMessage: "HoboDownLifecycleContractDownLifecycleDataModel"
	sourcePath:      "src/draft/hobo-down-lifecycle-contract/src/down-lifecycle.ts"
	packageName:     "hobo-down-lifecycle-contract"
	domain:          "hobo-down-lifecycle"
}

#HoboExperimentPortExperimentContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-experiment-port.experiment-contract"
	protobufMessage: "HoboExperimentPortExperimentContractDataModel"
	sourcePath:      "src/draft/hobo-experiment-port/src/experiment-contract.ts"
	packageName:     "hobo-experiment-port"
	domain:          "hobo-experiment-port"
}

#HoboFeatureFlagPortEvaluatorDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-feature-flag-port.evaluator"
	protobufMessage: "HoboFeatureFlagPortEvaluatorDataModel"
	sourcePath:      "src/draft/hobo-feature-flag-port/src/evaluator.ts"
	packageName:     "hobo-feature-flag-port"
	domain:          "hobo-feature-flag-port"
}

#HoboGatewayPortGatewayContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-gateway-port.gateway-contract"
	protobufMessage: "HoboGatewayPortGatewayContractDataModel"
	sourcePath:      "src/draft/hobo-gateway-port/src/gateway-contract.ts"
	packageName:     "hobo-gateway-port"
	domain:          "hobo-gateway-port"
}

#HoboInspectProjectionContractInspectContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-inspect-projection-contract.inspect-contract"
	protobufMessage: "HoboInspectProjectionContractInspectContractDataModel"
	sourcePath:      "src/draft/hobo-inspect-projection-contract/src/inspect-contract.ts"
	packageName:     "hobo-inspect-projection-contract"
	domain:          "hobo-inspect-projection"
}

#HoboJwtSvidContractJwtSvidDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-jwt-svid-contract.jwt-svid"
	protobufMessage: "HoboJwtSvidContractJwtSvidDataModel"
	sourcePath:      "src/draft/hobo-jwt-svid-contract/src/jwt-svid.ts"
	packageName:     "hobo-jwt-svid-contract"
	domain:          "hobo-jwt-svid"
}

#HoboLoginClaimContractLoginClaimContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-login-claim-contract.login-claim-contract"
	protobufMessage: "HoboLoginClaimContractLoginClaimContractDataModel"
	sourcePath:      "src/draft/hobo-login-claim-contract/src/login-claim-contract.ts"
	packageName:     "hobo-login-claim-contract"
	domain:          "hobo-login-claim"
}

#HoboLogsCliContractLogsCliDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-logs-cli-contract.logs-cli"
	protobufMessage: "HoboLogsCliContractLogsCliDataModel"
	sourcePath:      "src/draft/hobo-logs-cli-contract/src/logs-cli.ts"
	packageName:     "hobo-logs-cli-contract"
	domain:          "hobo-logs-cli"
}

#HoboManifestContractManifestDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-manifest-contract.manifest"
	protobufMessage: "HoboManifestContractManifestDataModel"
	sourcePath:      "src/draft/hobo-manifest-contract/src/manifest.ts"
	packageName:     "hobo-manifest-contract"
	domain:          "hobo-manifest"
}

#HoboMcpServerContractMcpServerContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-mcp-server-contract.mcp-server-contract"
	protobufMessage: "HoboMcpServerContractMcpServerContractDataModel"
	sourcePath:      "src/draft/hobo-mcp-server-contract/src/mcp-server-contract.ts"
	packageName:     "hobo-mcp-server-contract"
	domain:          "hobo-mcp-server"
}

#HoboMcpServerContractMcpSvidAuthDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-mcp-server-contract.mcp-svid-auth"
	protobufMessage: "HoboMcpServerContractMcpSvidAuthDataModel"
	sourcePath:      "src/draft/hobo-mcp-server-contract/src/mcp-svid-auth.ts"
	packageName:     "hobo-mcp-server-contract"
	domain:          "hobo-mcp-server"
}

#HoboMonorepoSkeletonContractMonorepoSkeletonContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-monorepo-skeleton-contract.monorepo-skeleton-contract"
	protobufMessage: "HoboMonorepoSkeletonContractMonorepoSkeletonContractDataModel"
	sourcePath:      "src/draft/hobo-monorepo-skeleton-contract/src/monorepo-skeleton-contract.ts"
	packageName:     "hobo-monorepo-skeleton-contract"
	domain:          "hobo-monorepo-skeleton"
}

#HoboNewScaffoldContractScaffoldDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-new-scaffold-contract.scaffold"
	protobufMessage: "HoboNewScaffoldContractScaffoldDataModel"
	sourcePath:      "src/draft/hobo-new-scaffold-contract/src/scaffold.ts"
	packageName:     "hobo-new-scaffold-contract"
	domain:          "hobo-new-scaffold"
}

#HoboPackageNamespaceMapPackageNamespaceMapDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-package-namespace-map.package-namespace-map"
	protobufMessage: "HoboPackageNamespaceMapPackageNamespaceMapDataModel"
	sourcePath:      "src/draft/hobo-package-namespace-map/src/package-namespace-map.ts"
	packageName:     "hobo-package-namespace-map"
	domain:          "hobo-package-namespace-map"
}

#HoboPlanPreviewContractPlanPreviewDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-plan-preview-contract.plan-preview"
	protobufMessage: "HoboPlanPreviewContractPlanPreviewDataModel"
	sourcePath:      "src/draft/hobo-plan-preview-contract/src/plan-preview.ts"
	packageName:     "hobo-plan-preview-contract"
	domain:          "hobo-plan-preview"
}

#HoboPolicyIrContractPolicyIrDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-policy-ir-contract.policy-ir"
	protobufMessage: "HoboPolicyIrContractPolicyIrDataModel"
	sourcePath:      "src/draft/hobo-policy-ir-contract/src/policy-ir.ts"
	packageName:     "hobo-policy-ir-contract"
	domain:          "hobo-policy-ir"
}

#HoboPrincipalRefContractPrincipalRefDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-principal-ref-contract.principal-ref"
	protobufMessage: "HoboPrincipalRefContractPrincipalRefDataModel"
	sourcePath:      "src/draft/hobo-principal-ref-contract/src/principal-ref.ts"
	packageName:     "hobo-principal-ref-contract"
	domain:          "hobo-principal-ref"
}

#HoboProjectionPortContractProjectionContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-projection-port-contract.projection-contract"
	protobufMessage: "HoboProjectionPortContractProjectionContractDataModel"
	sourcePath:      "src/draft/hobo-projection-port-contract/src/projection-contract.ts"
	packageName:     "hobo-projection-port-contract"
	domain:          "hobo-projection-port"
}

#HoboRealizeEmissionContractRealizeEmissionContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-realize-emission-contract.realize-emission-contract"
	protobufMessage: "HoboRealizeEmissionContractRealizeEmissionContractDataModel"
	sourcePath:      "src/draft/hobo-realize-emission-contract/src/realize-emission-contract.ts"
	packageName:     "hobo-realize-emission-contract"
	domain:          "hobo-realize-emission"
}

#HoboRelayContractHoboRelayDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-relay-contract.hobo-relay"
	protobufMessage: "HoboRelayContractHoboRelayDataModel"
	sourcePath:      "src/draft/hobo-relay-contract/src/hobo-relay.ts"
	packageName:     "hobo-relay-contract"
	domain:          "hobo-relay"
}

#HoboRemediationActionContractRemediationActionContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-remediation-action-contract.remediation-action-contract"
	protobufMessage: "HoboRemediationActionContractRemediationActionContractDataModel"
	sourcePath:      "src/draft/hobo-remediation-action-contract/src/remediation-action-contract.ts"
	packageName:     "hobo-remediation-action-contract"
	domain:          "hobo-remediation-action"
}

#HoboRuntimePrimitivesRuntimePrimitivesDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-runtime-primitives.runtime-primitives"
	protobufMessage: "HoboRuntimePrimitivesRuntimePrimitivesDataModel"
	sourcePath:      "src/draft/hobo-runtime-primitives/src/runtime-primitives.ts"
	packageName:     "hobo-runtime-primitives"
	domain:          "hobo-runtime-primitives"
}

#HoboSdkAggregateWitContractReverseExtractionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-sdk-aggregate-wit-contract.reverse-extraction"
	protobufMessage: "HoboSdkAggregateWitContractReverseExtractionDataModel"
	sourcePath:      "src/draft/hobo-sdk-aggregate-wit-contract/src/reverse-extraction.ts"
	packageName:     "hobo-sdk-aggregate-wit-contract"
	domain:          "hobo-sdk-aggregate-wit"
}

#HoboUpConvergenceContractUpConvergenceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-up-convergence-contract.up-convergence"
	protobufMessage: "HoboUpConvergenceContractUpConvergenceDataModel"
	sourcePath:      "src/draft/hobo-up-convergence-contract/src/up-convergence.ts"
	packageName:     "hobo-up-convergence-contract"
	domain:          "hobo-up-convergence"
}

#HoboWitToolchainContractWitToolchainContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.hobo-wit-toolchain-contract.wit-toolchain-contract"
	protobufMessage: "HoboWitToolchainContractWitToolchainContractDataModel"
	sourcePath:      "src/draft/hobo-wit-toolchain-contract/src/wit-toolchain-contract.ts"
	packageName:     "hobo-wit-toolchain-contract"
	domain:          "hobo-wit-toolchain"
}

#HostVersionUpgradeContractHostVersionUpgradeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.host-version-upgrade-contract.host-version-upgrade"
	protobufMessage: "HostVersionUpgradeContractHostVersionUpgradeDataModel"
	sourcePath:      "src/draft/host-version-upgrade-contract/src/host-version-upgrade.ts"
	packageName:     "host-version-upgrade-contract"
	domain:          "host-version-upgrade"
}

#HumanApprovalGenerationGateContractHumanApprovalGenerationGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.human-approval-generation-gate-contract.human-approval-generation-gate"
	protobufMessage: "HumanApprovalGenerationGateContractHumanApprovalGenerationGateDataModel"
	sourcePath:      "src/draft/human-approval-generation-gate-contract/src/human-approval-generation-gate.ts"
	packageName:     "human-approval-generation-gate-contract"
	domain:          "human-approval-generation-gate"
}

#HumanOperatorConsoleContractHumanOperatorConsoleDataModel: #DataModel & {
	contractId:      "hobo.datamodel.human-operator-console-contract.human-operator-console"
	protobufMessage: "HumanOperatorConsoleContractHumanOperatorConsoleDataModel"
	sourcePath:      "src/draft/human-operator-console-contract/src/human-operator-console.ts"
	packageName:     "human-operator-console-contract"
	domain:          "human-operator-console"
}

#IacCdktfImportOnlyContractCdktfImportOnlyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.iac-cdktf-import-only-contract.cdktf-import-only"
	protobufMessage: "IacCdktfImportOnlyContractCdktfImportOnlyDataModel"
	sourcePath:      "src/draft/iac-cdktf-import-only-contract/src/cdktf-import-only.ts"
	packageName:     "iac-cdktf-import-only-contract"
	domain:          "iac-cdktf-import-only"
}

#IacCrossplaneBackendContractCrossplaneIacBackendContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.iac-crossplane-backend-contract.crossplane-iac-backend-contract"
	protobufMessage: "IacCrossplaneBackendContractCrossplaneIacBackendContractDataModel"
	sourcePath:      "src/draft/iac-crossplane-backend-contract/src/crossplane-iac-backend-contract.ts"
	packageName:     "iac-crossplane-backend-contract"
	domain:          "iac-crossplane-backend"
}

#IacDriftRefreshFidelityContractIacDriftRefreshFidelityDataModel: #DataModel & {
	contractId:      "hobo.datamodel.iac-drift-refresh-fidelity-contract.iac-drift-refresh-fidelity"
	protobufMessage: "IacDriftRefreshFidelityContractIacDriftRefreshFidelityDataModel"
	sourcePath:      "src/draft/iac-drift-refresh-fidelity-contract/src/iac-drift-refresh-fidelity.ts"
	packageName:     "iac-drift-refresh-fidelity-contract"
	domain:          "iac-drift-refresh-fidelity"
}

#IacOpentofuBackendContractOpentofuIacBackendContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.iac-opentofu-backend-contract.opentofu-iac-backend-contract"
	protobufMessage: "IacOpentofuBackendContractOpentofuIacBackendContractDataModel"
	sourcePath:      "src/draft/iac-opentofu-backend-contract/src/opentofu-iac-backend-contract.ts"
	packageName:     "iac-opentofu-backend-contract"
	domain:          "iac-opentofu-backend"
}

#IacPartialApplyCompensationContractIacPartialApplyCompensationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.iac-partial-apply-compensation-contract.iac-partial-apply-compensation"
	protobufMessage: "IacPartialApplyCompensationContractIacPartialApplyCompensationDataModel"
	sourcePath:      "src/draft/iac-partial-apply-compensation-contract/src/iac-partial-apply-compensation.ts"
	packageName:     "iac-partial-apply-compensation-contract"
	domain:          "iac-partial-apply-compensation"
}

#IacPulumiBackendContractPulumiIacBackendContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.iac-pulumi-backend-contract.pulumi-iac-backend-contract"
	protobufMessage: "IacPulumiBackendContractPulumiIacBackendContractDataModel"
	sourcePath:      "src/draft/iac-pulumi-backend-contract/src/pulumi-iac-backend-contract.ts"
	packageName:     "iac-pulumi-backend-contract"
	domain:          "iac-pulumi-backend"
}

#IacStateModelContractIacStateModelContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.iac-state-model-contract.iac-state-model-contract"
	protobufMessage: "IacStateModelContractIacStateModelContractDataModel"
	sourcePath:      "src/draft/iac-state-model-contract/src/iac-state-model-contract.ts"
	packageName:     "iac-state-model-contract"
	domain:          "iac-state-model"
}

#IdJagThreatModelSpikeThreatModelDataModel: #DataModel & {
	contractId:      "hobo.datamodel.id-jag-threat-model-spike.threat-model"
	protobufMessage: "IdJagThreatModelSpikeThreatModelDataModel"
	sourcePath:      "src/draft/id-jag-threat-model-spike/src/threat-model.ts"
	packageName:     "id-jag-threat-model-spike"
	domain:          "id-jag-threat-model"
}

#IdJagTokenExchangeContractIdJagTokenExchangeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.id-jag-token-exchange-contract.id-jag-token-exchange"
	protobufMessage: "IdJagTokenExchangeContractIdJagTokenExchangeDataModel"
	sourcePath:      "src/draft/id-jag-token-exchange-contract/src/id-jag-token-exchange.ts"
	packageName:     "id-jag-token-exchange-contract"
	domain:          "id-jag-token-exchange"
}

#IdentityEventContractIdentityEventContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.identity-event-contract.identity-event-contract"
	protobufMessage: "IdentityEventContractIdentityEventContractDataModel"
	sourcePath:      "src/draft/identity-event-contract/src/identity-event-contract.ts"
	packageName:     "identity-event-contract"
	domain:          "identity-event"
}

#IdentityOcsfExportContractIdentityOcsfExportDataModel: #DataModel & {
	contractId:      "hobo.datamodel.identity-ocsf-export-contract.identity-ocsf-export"
	protobufMessage: "IdentityOcsfExportContractIdentityOcsfExportDataModel"
	sourcePath:      "src/draft/identity-ocsf-export-contract/src/identity-ocsf-export.ts"
	packageName:     "identity-ocsf-export-contract"
	domain:          "identity-ocsf-export"
}

#IdiomLayerLoweringContractLoweringContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.idiom-layer-lowering-contract.lowering-contract"
	protobufMessage: "IdiomLayerLoweringContractLoweringContractDataModel"
	sourcePath:      "src/draft/idiom-layer-lowering-contract/src/lowering-contract.ts"
	packageName:     "idiom-layer-lowering-contract"
	domain:          "idiom-layer-lowering"
}

#IdiomSemanticsAnnexSemanticsAnnexDataModel: #DataModel & {
	contractId:      "hobo.datamodel.idiom-semantics-annex.semantics-annex"
	protobufMessage: "IdiomSemanticsAnnexSemanticsAnnexDataModel"
	sourcePath:      "src/draft/idiom-semantics-annex/src/semantics-annex.ts"
	packageName:     "idiom-semantics-annex"
	domain:          "idiom-semantics-annex"
}

#IfcHandlerTriggerContractIfcHandlerTriggerContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.ifc-handler-trigger-contract.ifc-handler-trigger-contract"
	protobufMessage: "IfcHandlerTriggerContractIfcHandlerTriggerContractDataModel"
	sourcePath:      "src/draft/ifc-handler-trigger-contract/src/ifc-handler-trigger-contract.ts"
	packageName:     "ifc-handler-trigger-contract"
	domain:          "ifc-handler-trigger"
}

#InboundXaaResourceServerContractInboundXaaResourceServerDataModel: #DataModel & {
	contractId:      "hobo.datamodel.inbound-xaa-resource-server-contract.inbound-xaa-resource-server"
	protobufMessage: "InboundXaaResourceServerContractInboundXaaResourceServerDataModel"
	sourcePath:      "src/draft/inbound-xaa-resource-server-contract/src/inbound-xaa-resource-server.ts"
	packageName:     "inbound-xaa-resource-server-contract"
	domain:          "inbound-xaa-resource-server"
}

#IncidentAggregateContractIncidentAggregateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.incident-aggregate-contract.incident-aggregate"
	protobufMessage: "IncidentAggregateContractIncidentAggregateDataModel"
	sourcePath:      "src/draft/incident-aggregate-contract/src/incident-aggregate.ts"
	packageName:     "incident-aggregate-contract"
	domain:          "incident-aggregate"
}

#InternalCaPrivateAcmeContractInternalCaPrivateAcmeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.internal-ca-private-acme-contract.internal-ca-private-acme"
	protobufMessage: "InternalCaPrivateAcmeContractInternalCaPrivateAcmeDataModel"
	sourcePath:      "src/draft/internal-ca-private-acme-contract/src/internal-ca-private-acme.ts"
	packageName:     "internal-ca-private-acme-contract"
	domain:          "internal-ca-private-acme"
}

#InternalServiceDiscoveryContractInternalServiceDiscoveryDataModel: #DataModel & {
	contractId:      "hobo.datamodel.internal-service-discovery-contract.internal-service-discovery"
	protobufMessage: "InternalServiceDiscoveryContractInternalServiceDiscoveryDataModel"
	sourcePath:      "src/draft/internal-service-discovery-contract/src/internal-service-discovery.ts"
	packageName:     "internal-service-discovery-contract"
	domain:          "internal-service-discovery"
}

#JunctionConnectivityInferenceSpikeJunctionConnectivityInferenceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.junction-connectivity-inference-spike.junction-connectivity-inference"
	protobufMessage: "JunctionConnectivityInferenceSpikeJunctionConnectivityInferenceDataModel"
	sourcePath:      "src/draft/junction-connectivity-inference-spike/src/junction-connectivity-inference.ts"
	packageName:     "junction-connectivity-inference-spike"
	domain:          "junction-connectivity-inference"
}

#JunctionConnectivityPlanContractJunctionConnectivityPlanDataModel: #DataModel & {
	contractId:      "hobo.datamodel.junction-connectivity-plan-contract.junction-connectivity-plan"
	protobufMessage: "JunctionConnectivityPlanContractJunctionConnectivityPlanDataModel"
	sourcePath:      "src/draft/junction-connectivity-plan-contract/src/junction-connectivity-plan.ts"
	packageName:     "junction-connectivity-plan-contract"
	domain:          "junction-connectivity-plan"
}

#JunctionFederatedDomainContractJunctionFederatedDomainDataModel: #DataModel & {
	contractId:      "hobo.datamodel.junction-federated-domain-contract.junction-federated-domain"
	protobufMessage: "JunctionFederatedDomainContractJunctionFederatedDomainDataModel"
	sourcePath:      "src/draft/junction-federated-domain-contract/src/junction-federated-domain.ts"
	packageName:     "junction-federated-domain-contract"
	domain:          "junction-federated-domain"
}

#JunctionRegistryFederationContractJunctionRegistryFederationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.junction-registry-federation-contract.junction-registry-federation"
	protobufMessage: "JunctionRegistryFederationContractJunctionRegistryFederationDataModel"
	sourcePath:      "src/draft/junction-registry-federation-contract/src/junction-registry-federation.ts"
	packageName:     "junction-registry-federation-contract"
	domain:          "junction-registry-federation"
}

#JwtSvidIssuanceContractJwtSvidIssuerDataModel: #DataModel & {
	contractId:      "hobo.datamodel.jwt-svid-issuance-contract.jwt-svid-issuer"
	protobufMessage: "JwtSvidIssuanceContractJwtSvidIssuerDataModel"
	sourcePath:      "src/draft/jwt-svid-issuance-contract/src/jwt-svid-issuer.ts"
	packageName:     "jwt-svid-issuance-contract"
	domain:          "jwt-svid-issuance"
}

#LaunchSupportEscalationMatrixLaunchSupportEscalationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.launch-support-escalation-matrix.launch-support-escalation"
	protobufMessage: "LaunchSupportEscalationMatrixLaunchSupportEscalationDataModel"
	sourcePath:      "src/draft/launch-support-escalation-matrix/src/launch-support-escalation.ts"
	packageName:     "launch-support-escalation-matrix"
	domain:          "launch-support-escalation-matrix"
}

#LifecyclePhasePolicyContractLifecyclePhasePolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.lifecycle-phase-policy-contract.lifecycle-phase-policy"
	protobufMessage: "LifecyclePhasePolicyContractLifecyclePhasePolicyDataModel"
	sourcePath:      "src/draft/lifecycle-phase-policy-contract/src/lifecycle-phase-policy.ts"
	packageName:     "lifecycle-phase-policy-contract"
	domain:          "lifecycle-phase-policy"
}

#ListingLifecycleYankContractListingLifecycleYankDataModel: #DataModel & {
	contractId:      "hobo.datamodel.listing-lifecycle-yank-contract.listing-lifecycle-yank"
	protobufMessage: "ListingLifecycleYankContractListingLifecycleYankDataModel"
	sourcePath:      "src/draft/listing-lifecycle-yank-contract/src/listing-lifecycle-yank.ts"
	packageName:     "listing-lifecycle-yank-contract"
	domain:          "listing-lifecycle-yank"
}

#LiveEvalsRuntimeContractLiveEvalsRuntimeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.live-evals-runtime-contract.live-evals-runtime"
	protobufMessage: "LiveEvalsRuntimeContractLiveEvalsRuntimeDataModel"
	sourcePath:      "src/draft/live-evals-runtime-contract/src/live-evals-runtime.ts"
	packageName:     "live-evals-runtime-contract"
	domain:          "live-evals-runtime"
}

#LiveFixGatedCandidateContractLiveFixGatedCandidateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.live-fix-gated-candidate-contract.live-fix-gated-candidate"
	protobufMessage: "LiveFixGatedCandidateContractLiveFixGatedCandidateDataModel"
	sourcePath:      "src/draft/live-fix-gated-candidate-contract/src/live-fix-gated-candidate.ts"
	packageName:     "live-fix-gated-candidate-contract"
	domain:          "live-fix-gated-candidate"
}

#LocalDevTestAuthoringContractLocalDevTestAuthoringDataModel: #DataModel & {
	contractId:      "hobo.datamodel.local-dev-test-authoring-contract.local-dev-test-authoring"
	protobufMessage: "LocalDevTestAuthoringContractLocalDevTestAuthoringDataModel"
	sourcePath:      "src/draft/local-dev-test-authoring-contract/src/local-dev-test-authoring.ts"
	packageName:     "local-dev-test-authoring-contract"
	domain:          "local-dev-test-authoring"
}

#MaliciousProviderContainmentContractProviderContainmentContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.malicious-provider-containment-contract.provider-containment-contract"
	protobufMessage: "MaliciousProviderContainmentContractProviderContainmentContractDataModel"
	sourcePath:      "src/draft/malicious-provider-containment-contract/src/provider-containment-contract.ts"
	packageName:     "malicious-provider-containment-contract"
	domain:          "malicious-provider-containment"
}

#MatchingEngineSkeletonContractMatchingEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.matching-engine-skeleton-contract.matching-engine"
	protobufMessage: "MatchingEngineSkeletonContractMatchingEngineDataModel"
	sourcePath:      "src/draft/matching-engine-skeleton-contract/src/matching-engine.ts"
	packageName:     "matching-engine-skeleton-contract"
	domain:          "matching-engine-skeleton"
}

#MatchingSpecificityVectorsMatchingDataModel: #DataModel & {
	contractId:      "hobo.datamodel.matching-specificity-vectors.matching"
	protobufMessage: "MatchingSpecificityVectorsMatchingDataModel"
	sourcePath:      "src/draft/matching-specificity-vectors/src/matching.ts"
	packageName:     "matching-specificity-vectors"
	domain:          "matching-specificity-vectors"
}

#MaterializationSubscriptionContractMaterializationSubscriptionContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.materialization-subscription-contract.materialization-subscription-contract"
	protobufMessage: "MaterializationSubscriptionContractMaterializationSubscriptionContractDataModel"
	sourcePath:      "src/draft/materialization-subscription-contract/src/materialization-subscription-contract.ts"
	packageName:     "materialization-subscription-contract"
	domain:          "materialization-subscription"
}

#McpServerHardeningContractMcpServerHardeningDataModel: #DataModel & {
	contractId:      "hobo.datamodel.mcp-server-hardening-contract.mcp-server-hardening"
	protobufMessage: "McpServerHardeningContractMcpServerHardeningDataModel"
	sourcePath:      "src/draft/mcp-server-hardening-contract/src/mcp-server-hardening.ts"
	packageName:     "mcp-server-hardening-contract"
	domain:          "mcp-server-hardening"
}

#MeteringViewProjectionContractMeteringViewDataModel: #DataModel & {
	contractId:      "hobo.datamodel.metering-view-projection-contract.metering-view"
	protobufMessage: "MeteringViewProjectionContractMeteringViewDataModel"
	sourcePath:      "src/draft/metering-view-projection-contract/src/metering-view.ts"
	packageName:     "metering-view-projection-contract"
	domain:          "metering-view-projection"
}

#MetricsCatalogPipelineContractMetricsCatalogPipelineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.metrics-catalog-pipeline-contract.metrics-catalog-pipeline"
	protobufMessage: "MetricsCatalogPipelineContractMetricsCatalogPipelineDataModel"
	sourcePath:      "src/draft/metrics-catalog-pipeline-contract/src/metrics-catalog-pipeline.ts"
	packageName:     "metrics-catalog-pipeline-contract"
	domain:          "metrics-catalog-pipeline"
}

#MirrorDigestSelectionContractMirrorDigestSelectionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.mirror-digest-selection-contract.mirror-digest-selection"
	protobufMessage: "MirrorDigestSelectionContractMirrorDigestSelectionDataModel"
	sourcePath:      "src/draft/mirror-digest-selection-contract/src/mirror-digest-selection.ts"
	packageName:     "mirror-digest-selection-contract"
	domain:          "mirror-digest-selection"
}

#MtlsByDefaultConformanceGateMtlsByDefaultConformanceGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.mtls-by-default-conformance-gate.mtls-by-default-conformance-gate"
	protobufMessage: "MtlsByDefaultConformanceGateMtlsByDefaultConformanceGateDataModel"
	sourcePath:      "src/draft/mtls-by-default-conformance-gate/src/mtls-by-default-conformance-gate.ts"
	packageName:     "mtls-by-default-conformance-gate"
	domain:          "mtls-by-default-conformance-gate"
}

#MtlsDataPathContractMtlsDataPathDataModel: #DataModel & {
	contractId:      "hobo.datamodel.mtls-data-path-contract.mtls-data-path"
	protobufMessage: "MtlsDataPathContractMtlsDataPathDataModel"
	sourcePath:      "src/draft/mtls-data-path-contract/src/mtls-data-path.ts"
	packageName:     "mtls-data-path-contract"
	domain:          "mtls-data-path"
}

#MultiCloudShopProviderE2eContractMultiCloudShopGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.multi-cloud-shop-provider-e2e-contract.multi-cloud-shop-gate"
	protobufMessage: "MultiCloudShopProviderE2eContractMultiCloudShopGateDataModel"
	sourcePath:      "src/draft/multi-cloud-shop-provider-e2e-contract/src/multi-cloud-shop-gate.ts"
	packageName:     "multi-cloud-shop-provider-e2e-contract"
	domain:          "multi-cloud-shop-provider-e2e"
}

#NativeLogProjectionContractNativeLogProjectionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.native-log-projection-contract.native-log-projection"
	protobufMessage: "NativeLogProjectionContractNativeLogProjectionDataModel"
	sourcePath:      "src/draft/native-log-projection-contract/src/native-log-projection.ts"
	packageName:     "native-log-projection-contract"
	domain:          "native-log-projection"
}

#NoEgressGenerationSandboxContractContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.no-egress-generation-sandbox-contract.contract"
	protobufMessage: "NoEgressGenerationSandboxContractContractDataModel"
	sourcePath:      "src/draft/no-egress-generation-sandbox-contract/src/contract.ts"
	packageName:     "no-egress-generation-sandbox-contract"
	domain:          "no-egress-generation-sandbox"
}

#NoPrivilegeEscalationPolicyContractNoPrivilegeEscalationPolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.no-privilege-escalation-policy-contract.no-privilege-escalation-policy"
	protobufMessage: "NoPrivilegeEscalationPolicyContractNoPrivilegeEscalationPolicyDataModel"
	sourcePath:      "src/draft/no-privilege-escalation-policy-contract/src/no-privilege-escalation-policy.ts"
	packageName:     "no-privilege-escalation-policy-contract"
	domain:          "no-privilege-escalation-policy"
}

#NonIacDriverAdaptersContractNonIacDriverAdaptersDataModel: #DataModel & {
	contractId:      "hobo.datamodel.non-iac-driver-adapters-contract.non-iac-driver-adapters"
	protobufMessage: "NonIacDriverAdaptersContractNonIacDriverAdaptersDataModel"
	sourcePath:      "src/draft/non-iac-driver-adapters-contract/src/non-iac-driver-adapters.ts"
	packageName:     "non-iac-driver-adapters-contract"
	domain:          "non-iac-driver-adapters"
}

#ObligationEngineContractObligationEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.obligation-engine-contract.obligation-engine"
	protobufMessage: "ObligationEngineContractObligationEngineDataModel"
	sourcePath:      "src/draft/obligation-engine-contract/src/obligation-engine.ts"
	packageName:     "obligation-engine-contract"
	domain:          "obligation-engine"
}

#ObservabilityCostGuardContractObservabilityCostGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.observability-cost-guard-contract.observability-cost-guard"
	protobufMessage: "ObservabilityCostGuardContractObservabilityCostGuardDataModel"
	sourcePath:      "src/draft/observability-cost-guard-contract/src/observability-cost-guard.ts"
	packageName:     "observability-cost-guard-contract"
	domain:          "observability-cost-guard"
}

#ObservedContractPromotionContractObservedContractPromotionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.observed-contract-promotion-contract.observed-contract-promotion"
	protobufMessage: "ObservedContractPromotionContractObservedContractPromotionDataModel"
	sourcePath:      "src/draft/observed-contract-promotion-contract/src/observed-contract-promotion.ts"
	packageName:     "observed-contract-promotion-contract"
	domain:          "observed-contract-promotion"
}

#OciArtifactStorageContractOciArtifactStorageDataModel: #DataModel & {
	contractId:      "hobo.datamodel.oci-artifact-storage-contract.oci-artifact-storage"
	protobufMessage: "OciArtifactStorageContractOciArtifactStorageDataModel"
	sourcePath:      "src/draft/oci-artifact-storage-contract/src/oci-artifact-storage.ts"
	packageName:     "oci-artifact-storage-contract"
	domain:          "oci-artifact-storage"
}

#OfflineImportIntegrityContractOfflineImportIntegrityDataModel: #DataModel & {
	contractId:      "hobo.datamodel.offline-import-integrity-contract.offline-import-integrity"
	protobufMessage: "OfflineImportIntegrityContractOfflineImportIntegrityDataModel"
	sourcePath:      "src/draft/offline-import-integrity-contract/src/offline-import-integrity.ts"
	packageName:     "offline-import-integrity-contract"
	domain:          "offline-import-integrity"
}

#OidcFederationStsContractOidcFederationStsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.oidc-federation-sts-contract.oidc-federation-sts"
	protobufMessage: "OidcFederationStsContractOidcFederationStsDataModel"
	sourcePath:      "src/draft/oidc-federation-sts-contract/src/oidc-federation-sts.ts"
	packageName:     "oidc-federation-sts-contract"
	domain:          "oidc-federation-sts"
}

#OnCallEscalationContractOnCallEscalationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.on-call-escalation-contract.on-call-escalation"
	protobufMessage: "OnCallEscalationContractOnCallEscalationDataModel"
	sourcePath:      "src/draft/on-call-escalation-contract/src/on-call-escalation.ts"
	packageName:     "on-call-escalation-contract"
	domain:          "on-call-escalation"
}

#OpenexperimentRuntimeDataContractOpenexperimentRuntimeDataDataModel: #DataModel & {
	contractId:      "hobo.datamodel.openexperiment-runtime-data-contract.openexperiment-runtime-data"
	protobufMessage: "OpenexperimentRuntimeDataContractOpenexperimentRuntimeDataDataModel"
	sourcePath:      "src/draft/openexperiment-runtime-data-contract/src/openexperiment-runtime-data.ts"
	packageName:     "openexperiment-runtime-data-contract"
	domain:          "openexperiment-runtime-data"
}

#OpenfeatureProviderAdaptersContractOpenfeatureProviderAdaptersDataModel: #DataModel & {
	contractId:      "hobo.datamodel.openfeature-provider-adapters-contract.openfeature-provider-adapters"
	protobufMessage: "OpenfeatureProviderAdaptersContractOpenfeatureProviderAdaptersDataModel"
	sourcePath:      "src/draft/openfeature-provider-adapters-contract/src/openfeature-provider-adapters.ts"
	packageName:     "openfeature-provider-adapters-contract"
	domain:          "openfeature-provider-adapters"
}

#OpeninferenceLiveEvalStreamContractOpeninferenceLiveEvalStreamDataModel: #DataModel & {
	contractId:      "hobo.datamodel.openinference-live-eval-stream-contract.openinference-live-eval-stream"
	protobufMessage: "OpeninferenceLiveEvalStreamContractOpeninferenceLiveEvalStreamDataModel"
	sourcePath:      "src/draft/openinference-live-eval-stream-contract/src/openinference-live-eval-stream.ts"
	packageName:     "openinference-live-eval-stream-contract"
	domain:          "openinference-live-eval-stream"
}

#OpeninferenceTrajectoryCaptureContractOpeninferenceTrajectoryCaptureDataModel: #DataModel & {
	contractId:      "hobo.datamodel.openinference-trajectory-capture-contract.openinference-trajectory-capture"
	protobufMessage: "OpeninferenceTrajectoryCaptureContractOpeninferenceTrajectoryCaptureDataModel"
	sourcePath:      "src/draft/openinference-trajectory-capture-contract/src/openinference-trajectory-capture.ts"
	packageName:     "openinference-trajectory-capture-contract"
	domain:          "openinference-trajectory-capture"
}

#OperationsManifestsContractOperationsManifestsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.operations-manifests-contract.operations-manifests"
	protobufMessage: "OperationsManifestsContractOperationsManifestsDataModel"
	sourcePath:      "src/draft/operations-manifests-contract/src/operations-manifests.ts"
	packageName:     "operations-manifests-contract"
	domain:          "operations-manifests"
}

#OperatorIntegrationPortsContractOperatorIntegrationPortsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.operator-integration-ports-contract.operator-integration-ports"
	protobufMessage: "OperatorIntegrationPortsContractOperatorIntegrationPortsDataModel"
	sourcePath:      "src/draft/operator-integration-ports-contract/src/operator-integration-ports.ts"
	packageName:     "operator-integration-ports-contract"
	domain:          "operator-integration-ports"
}

#OrchestratorChoreographySkeletonContractOrchestratorChoreographyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.orchestrator-choreography-skeleton-contract.orchestrator-choreography"
	protobufMessage: "OrchestratorChoreographySkeletonContractOrchestratorChoreographyDataModel"
	sourcePath:      "src/draft/orchestrator-choreography-skeleton-contract/src/orchestrator-choreography.ts"
	packageName:     "orchestrator-choreography-skeleton-contract"
	domain:          "orchestrator-choreography-skeleton"
}

#OtelTracesPipelineContractOtelTracesPipelineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.otel-traces-pipeline-contract.otel-traces-pipeline"
	protobufMessage: "OtelTracesPipelineContractOtelTracesPipelineDataModel"
	sourcePath:      "src/draft/otel-traces-pipeline-contract/src/otel-traces-pipeline.ts"
	packageName:     "otel-traces-pipeline-contract"
	domain:          "otel-traces-pipeline"
}

#OutboundXaaTokenExchangeContractOutboundXaaTokenExchangeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.outbound-xaa-token-exchange-contract.outbound-xaa-token-exchange"
	protobufMessage: "OutboundXaaTokenExchangeContractOutboundXaaTokenExchangeDataModel"
	sourcePath:      "src/draft/outbound-xaa-token-exchange-contract/src/outbound-xaa-token-exchange.ts"
	packageName:     "outbound-xaa-token-exchange-contract"
	domain:          "outbound-xaa-token-exchange"
}

#PaginatedQueryContractPaginatedQueryContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.paginated-query-contract.paginated-query-contract"
	protobufMessage: "PaginatedQueryContractPaginatedQueryContractDataModel"
	sourcePath:      "src/draft/paginated-query-contract/src/paginated-query-contract.ts"
	packageName:     "paginated-query-contract"
	domain:          "paginated-query"
}

#ParadigmIdiomPackagesContractParadigmIdiomPackagesDataModel: #DataModel & {
	contractId:      "hobo.datamodel.paradigm-idiom-packages-contract.paradigm-idiom-packages"
	protobufMessage: "ParadigmIdiomPackagesContractParadigmIdiomPackagesDataModel"
	sourcePath:      "src/draft/paradigm-idiom-packages-contract/src/paradigm-idiom-packages.ts"
	packageName:     "paradigm-idiom-packages-contract"
	domain:          "paradigm-idiom-packages"
}

#PartialRealizeRollbackContractPartialRealizeRollbackDataModel: #DataModel & {
	contractId:      "hobo.datamodel.partial-realize-rollback-contract.partial-realize-rollback"
	protobufMessage: "PartialRealizeRollbackContractPartialRealizeRollbackDataModel"
	sourcePath:      "src/draft/partial-realize-rollback-contract/src/partial-realize-rollback.ts"
	packageName:     "partial-realize-rollback-contract"
	domain:          "partial-realize-rollback"
}

#PerAppTenantRoutingContractPerAppTenantRoutingDataModel: #DataModel & {
	contractId:      "hobo.datamodel.per-app-tenant-routing-contract.per-app-tenant-routing"
	protobufMessage: "PerAppTenantRoutingContractPerAppTenantRoutingDataModel"
	sourcePath:      "src/draft/per-app-tenant-routing-contract/src/per-app-tenant-routing.ts"
	packageName:     "per-app-tenant-routing-contract"
	domain:          "per-app-tenant-routing"
}

#PlannerDagSkeletonContractPlannerDataModel: #DataModel & {
	contractId:      "hobo.datamodel.planner-dag-skeleton-contract.planner"
	protobufMessage: "PlannerDagSkeletonContractPlannerDataModel"
	sourcePath:      "src/draft/planner-dag-skeleton-contract/src/planner.ts"
	packageName:     "planner-dag-skeleton-contract"
	domain:          "planner-dag-skeleton"
}

#PlatformEngineerFlowContractPlatformEngineerFlowDataModel: #DataModel & {
	contractId:      "hobo.datamodel.platform-engineer-flow-contract.platform-engineer-flow"
	protobufMessage: "PlatformEngineerFlowContractPlatformEngineerFlowDataModel"
	sourcePath:      "src/draft/platform-engineer-flow-contract/src/platform-engineer-flow.ts"
	packageName:     "platform-engineer-flow-contract"
	domain:          "platform-engineer-flow"
}

#PoisonEventQuarantineContractPoisonEventQuarantineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.poison-event-quarantine-contract.poison-event-quarantine"
	protobufMessage: "PoisonEventQuarantineContractPoisonEventQuarantineDataModel"
	sourcePath:      "src/draft/poison-event-quarantine-contract/src/poison-event-quarantine.ts"
	packageName:     "poison-event-quarantine-contract"
	domain:          "poison-event-quarantine"
}

#PolicyAuditExportContractPolicyAuditExportDataModel: #DataModel & {
	contractId:      "hobo.datamodel.policy-audit-export-contract.policy-audit-export"
	protobufMessage: "PolicyAuditExportContractPolicyAuditExportDataModel"
	sourcePath:      "src/draft/policy-audit-export-contract/src/policy-audit-export.ts"
	packageName:     "policy-audit-export-contract"
	domain:          "policy-audit-export"
}

#PolicyAuthoringWaiverContractPolicyAuthoringWaiverDataModel: #DataModel & {
	contractId:      "hobo.datamodel.policy-authoring-waiver-contract.policy-authoring-waiver"
	protobufMessage: "PolicyAuthoringWaiverContractPolicyAuthoringWaiverDataModel"
	sourcePath:      "src/draft/policy-authoring-waiver-contract/src/policy-authoring-waiver.ts"
	packageName:     "policy-authoring-waiver-contract"
	domain:          "policy-authoring-waiver"
}

#PolicyEnginePortContractPolicyEnginePortDataModel: #DataModel & {
	contractId:      "hobo.datamodel.policy-engine-port-contract.policy-engine-port"
	protobufMessage: "PolicyEnginePortContractPolicyEnginePortDataModel"
	sourcePath:      "src/draft/policy-engine-port-contract/src/policy-engine-port.ts"
	packageName:     "policy-engine-port-contract"
	domain:          "policy-engine-port"
}

#PolicyEngineProviderAdaptersContractPolicyEngineProviderAdaptersDataModel: #DataModel & {
	contractId:      "hobo.datamodel.policy-engine-provider-adapters-contract.policy-engine-provider-adapters"
	protobufMessage: "PolicyEngineProviderAdaptersContractPolicyEngineProviderAdaptersDataModel"
	sourcePath:      "src/draft/policy-engine-provider-adapters-contract/src/policy-engine-provider-adapters.ts"
	packageName:     "policy-engine-provider-adapters-contract"
	domain:          "policy-engine-provider-adapters"
}

#PolicyFailClosedContractPolicyFailClosedDataModel: #DataModel & {
	contractId:      "hobo.datamodel.policy-fail-closed-contract.policy-fail-closed"
	protobufMessage: "PolicyFailClosedContractPolicyFailClosedDataModel"
	sourcePath:      "src/draft/policy-fail-closed-contract/src/policy-fail-closed.ts"
	packageName:     "policy-fail-closed-contract"
	domain:          "policy-fail-closed"
}

#PolicyGatedFlagFlipsContractPolicyGatedFlagFlipsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.policy-gated-flag-flips-contract.policy-gated-flag-flips"
	protobufMessage: "PolicyGatedFlagFlipsContractPolicyGatedFlagFlipsDataModel"
	sourcePath:      "src/draft/policy-gated-flag-flips-contract/src/policy-gated-flag-flips.ts"
	packageName:     "policy-gated-flag-flips-contract"
	domain:          "policy-gated-flag-flips"
}

#PolicyPackFederationContractPolicyPackFederationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.policy-pack-federation-contract.policy-pack-federation"
	protobufMessage: "PolicyPackFederationContractPolicyPackFederationDataModel"
	sourcePath:      "src/draft/policy-pack-federation-contract/src/policy-pack-federation.ts"
	packageName:     "policy-pack-federation-contract"
	domain:          "policy-pack-federation"
}

#PolicySupplyChainTrustContractPolicySupplyChainTrustDataModel: #DataModel & {
	contractId:      "hobo.datamodel.policy-supply-chain-trust-contract.policy-supply-chain-trust"
	protobufMessage: "PolicySupplyChainTrustContractPolicySupplyChainTrustDataModel"
	sourcePath:      "src/draft/policy-supply-chain-trust-contract/src/policy-supply-chain-trust.ts"
	packageName:     "policy-supply-chain-trust-contract"
	domain:          "policy-supply-chain-trust"
}

#PortabilityReportContractPortabilityReportContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.portability-report-contract.portability-report-contract"
	protobufMessage: "PortabilityReportContractPortabilityReportContractDataModel"
	sourcePath:      "src/draft/portability-report-contract/src/portability-report-contract.ts"
	packageName:     "portability-report-contract"
	domain:          "portability-report"
}

#PortabilitySwapEquivalentContractPortabilitySwapEquivalentDataModel: #DataModel & {
	contractId:      "hobo.datamodel.portability-swap-equivalent-contract.portability-swap-equivalent"
	protobufMessage: "PortabilitySwapEquivalentContractPortabilitySwapEquivalentDataModel"
	sourcePath:      "src/draft/portability-swap-equivalent-contract/src/portability-swap-equivalent.ts"
	packageName:     "portability-swap-equivalent-contract"
	domain:          "portability-swap-equivalent"
}

#PreLaunchOutcomeContractPreLaunchOutcomeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.pre-launch-outcome-contract.pre-launch-outcome"
	protobufMessage: "PreLaunchOutcomeContractPreLaunchOutcomeDataModel"
	sourcePath:      "src/draft/pre-launch-outcome-contract/src/pre-launch-outcome.ts"
	packageName:     "pre-launch-outcome-contract"
	domain:          "pre-launch-outcome"
}

#PreviewEphemeralEnvironmentsContractPreviewEnvironmentsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.preview-ephemeral-environments-contract.preview-environments"
	protobufMessage: "PreviewEphemeralEnvironmentsContractPreviewEnvironmentsDataModel"
	sourcePath:      "src/draft/preview-ephemeral-environments-contract/src/preview-environments.ts"
	packageName:     "preview-ephemeral-environments-contract"
	domain:          "preview-ephemeral-environments"
}

#ProjectionConsistencyReactivityContractProjectionContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.projection-consistency-reactivity-contract.projection-contract"
	protobufMessage: "ProjectionConsistencyReactivityContractProjectionContractDataModel"
	sourcePath:      "src/draft/projection-consistency-reactivity-contract/src/projection-contract.ts"
	packageName:     "projection-consistency-reactivity-contract"
	domain:          "projection-consistency-reactivity"
}

#ProjectionLagConsistencyContractProjectionLagConsistencyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.projection-lag-consistency-contract.projection-lag-consistency"
	protobufMessage: "ProjectionLagConsistencyContractProjectionLagConsistencyDataModel"
	sourcePath:      "src/draft/projection-lag-consistency-contract/src/projection-lag-consistency.ts"
	packageName:     "projection-lag-consistency-contract"
	domain:          "projection-lag-consistency"
}

#ProjectionRebuildContractProjectionRebuildContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.projection-rebuild-contract.projection-rebuild-contract"
	protobufMessage: "ProjectionRebuildContractProjectionRebuildContractDataModel"
	sourcePath:      "src/draft/projection-rebuild-contract/src/projection-rebuild-contract.ts"
	packageName:     "projection-rebuild-contract"
	domain:          "projection-rebuild"
}

#ProjectionSinkChangeFeedConformanceContractChangeFeedConformanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.projection-sink-change-feed-conformance-contract.change-feed-conformance"
	protobufMessage: "ProjectionSinkChangeFeedConformanceContractChangeFeedConformanceDataModel"
	sourcePath:      "src/draft/projection-sink-change-feed-conformance-contract/src/change-feed-conformance.ts"
	packageName:     "projection-sink-change-feed-conformance-contract"
	domain:          "projection-sink-change-feed-conformance"
}

#ProviderAuthoringContractProviderAuthoringContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-authoring-contract.provider-authoring-contract"
	protobufMessage: "ProviderAuthoringContractProviderAuthoringContractDataModel"
	sourcePath:      "src/draft/provider-authoring-contract/src/provider-authoring-contract.ts"
	packageName:     "provider-authoring-contract"
	domain:          "provider-authoring"
}

#ProviderAwsContractProviderAwsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-aws-contract.provider-aws"
	protobufMessage: "ProviderAwsContractProviderAwsDataModel"
	sourcePath:      "src/draft/provider-aws-contract/src/provider-aws.ts"
	packageName:     "provider-aws-contract"
	domain:          "provider-aws"
}

#ProviderAzureContractProviderAzureDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-azure-contract.provider-azure"
	protobufMessage: "ProviderAzureContractProviderAzureDataModel"
	sourcePath:      "src/draft/provider-azure-contract/src/provider-azure.ts"
	packageName:     "provider-azure-contract"
	domain:          "provider-azure"
}

#ProviderCapabilityConformanceSuitesProviderCapabilityConformanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-capability-conformance-suites.provider-capability-conformance"
	protobufMessage: "ProviderCapabilityConformanceSuitesProviderCapabilityConformanceDataModel"
	sourcePath:      "src/draft/provider-capability-conformance-suites/src/provider-capability-conformance.ts"
	packageName:     "provider-capability-conformance-suites"
	domain:          "provider-capability-conformance-suites"
}

#ProviderCapabilityManifestContractProviderCapabilityManifestDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-capability-manifest-contract.provider-capability-manifest"
	protobufMessage: "ProviderCapabilityManifestContractProviderCapabilityManifestDataModel"
	sourcePath:      "src/draft/provider-capability-manifest-contract/src/provider-capability-manifest.ts"
	packageName:     "provider-capability-manifest-contract"
	domain:          "provider-capability-manifest"
}

#ProviderCloudflareContractProviderCloudflareDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-cloudflare-contract.provider-cloudflare"
	protobufMessage: "ProviderCloudflareContractProviderCloudflareDataModel"
	sourcePath:      "src/draft/provider-cloudflare-contract/src/provider-cloudflare.ts"
	packageName:     "provider-cloudflare-contract"
	domain:          "provider-cloudflare"
}

#ProviderDefaultDefinitionsContractProviderDefaultDefinitionsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-default-definitions-contract.provider-default-definitions"
	protobufMessage: "ProviderDefaultDefinitionsContractProviderDefaultDefinitionsDataModel"
	sourcePath:      "src/draft/provider-default-definitions-contract/src/provider-default-definitions.ts"
	packageName:     "provider-default-definitions-contract"
	domain:          "provider-default-definitions"
}

#ProviderFlyContractProviderFlyContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-fly-contract.provider-fly-contract"
	protobufMessage: "ProviderFlyContractProviderFlyContractDataModel"
	sourcePath:      "src/draft/provider-fly-contract/src/provider-fly-contract.ts"
	packageName:     "provider-fly-contract"
	domain:          "provider-fly"
}

#ProviderGcpContractProviderGcpDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-gcp-contract.provider-gcp"
	protobufMessage: "ProviderGcpContractProviderGcpDataModel"
	sourcePath:      "src/draft/provider-gcp-contract/src/provider-gcp.ts"
	packageName:     "provider-gcp-contract"
	domain:          "provider-gcp"
}

#ProviderHetznerContractProviderHetznerDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-hetzner-contract.provider-hetzner"
	protobufMessage: "ProviderHetznerContractProviderHetznerDataModel"
	sourcePath:      "src/draft/provider-hetzner-contract/src/provider-hetzner.ts"
	packageName:     "provider-hetzner-contract"
	domain:          "provider-hetzner"
}

#ProviderKubernetesContractProviderKubernetesDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-kubernetes-contract.provider-kubernetes"
	protobufMessage: "ProviderKubernetesContractProviderKubernetesDataModel"
	sourcePath:      "src/draft/provider-kubernetes-contract/src/provider-kubernetes.ts"
	packageName:     "provider-kubernetes-contract"
	domain:          "provider-kubernetes"
}

#ProviderLocalZeroInfraProviderLocalDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-local-zero-infra.provider-local"
	protobufMessage: "ProviderLocalZeroInfraProviderLocalDataModel"
	sourcePath:      "src/draft/provider-local-zero-infra/src/provider-local.ts"
	packageName:     "provider-local-zero-infra"
	domain:          "provider-local-zero-infra"
}

#ProviderOptionsPatternContractProviderOptionsContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-options-pattern-contract.provider-options-contract"
	protobufMessage: "ProviderOptionsPatternContractProviderOptionsContractDataModel"
	sourcePath:      "src/draft/provider-options-pattern-contract/src/provider-options-contract.ts"
	packageName:     "provider-options-pattern-contract"
	domain:          "provider-options-pattern"
}

#ProviderPortContractProviderPortsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-port-contract.provider-ports"
	protobufMessage: "ProviderPortContractProviderPortsDataModel"
	sourcePath:      "src/draft/provider-port-contract/src/provider-ports.ts"
	packageName:     "provider-port-contract"
	domain:          "provider-port"
}

#ProviderVercelContractProviderVercelDataModel: #DataModel & {
	contractId:      "hobo.datamodel.provider-vercel-contract.provider-vercel"
	protobufMessage: "ProviderVercelContractProviderVercelDataModel"
	sourcePath:      "src/draft/provider-vercel-contract/src/provider-vercel.ts"
	packageName:     "provider-vercel-contract"
	domain:          "provider-vercel"
}

#QueueClockRuntimePortContractQueueClockRuntimePortDataModel: #DataModel & {
	contractId:      "hobo.datamodel.queue-clock-runtime-port-contract.queue-clock-runtime-port"
	protobufMessage: "QueueClockRuntimePortContractQueueClockRuntimePortDataModel"
	sourcePath:      "src/draft/queue-clock-runtime-port-contract/src/queue-clock-runtime-port.ts"
	packageName:     "queue-clock-runtime-port-contract"
	domain:          "queue-clock-runtime-port"
}

#RawDriverEscapeHatchContractRawDriverEscapeHatchDataModel: #DataModel & {
	contractId:      "hobo.datamodel.raw-driver-escape-hatch-contract.raw-driver-escape-hatch"
	protobufMessage: "RawDriverEscapeHatchContractRawDriverEscapeHatchDataModel"
	sourcePath:      "src/draft/raw-driver-escape-hatch-contract/src/raw-driver-escape-hatch.ts"
	packageName:     "raw-driver-escape-hatch-contract"
	domain:          "raw-driver-escape-hatch"
}

#RbacRoleBindingContractRbacRoleBindingDataModel: #DataModel & {
	contractId:      "hobo.datamodel.rbac-role-binding-contract.rbac-role-binding"
	protobufMessage: "RbacRoleBindingContractRbacRoleBindingDataModel"
	sourcePath:      "src/draft/rbac-role-binding-contract/src/rbac-role-binding.ts"
	packageName:     "rbac-role-binding-contract"
	domain:          "rbac-role-binding"
}

#ReactorCoalescingFanoutContractReactorCoalescingFanoutDataModel: #DataModel & {
	contractId:      "hobo.datamodel.reactor-coalescing-fanout-contract.reactor-coalescing-fanout"
	protobufMessage: "ReactorCoalescingFanoutContractReactorCoalescingFanoutDataModel"
	sourcePath:      "src/draft/reactor-coalescing-fanout-contract/src/reactor-coalescing-fanout.ts"
	packageName:     "reactor-coalescing-fanout-contract"
	domain:          "reactor-coalescing-fanout"
}

#ReactorSkeletonContractReactorSkeletonContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.reactor-skeleton-contract.reactor-skeleton-contract"
	protobufMessage: "ReactorSkeletonContractReactorSkeletonContractDataModel"
	sourcePath:      "src/draft/reactor-skeleton-contract/src/reactor-skeleton-contract.ts"
	packageName:     "reactor-skeleton-contract"
	domain:          "reactor-skeleton"
}

#ReadsYourWritesContractReadsYourWritesContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.reads-your-writes-contract.reads-your-writes-contract"
	protobufMessage: "ReadsYourWritesContractReadsYourWritesContractDataModel"
	sourcePath:      "src/draft/reads-your-writes-contract/src/reads-your-writes-contract.ts"
	packageName:     "reads-your-writes-contract"
	domain:          "reads-your-writes"
}

#RegionObjectiveRankingContractRegionObjectiveRankingDataModel: #DataModel & {
	contractId:      "hobo.datamodel.region-objective-ranking-contract.region-objective-ranking"
	protobufMessage: "RegionObjectiveRankingContractRegionObjectiveRankingDataModel"
	sourcePath:      "src/draft/region-objective-ranking-contract/src/region-objective-ranking.ts"
	packageName:     "region-objective-ranking-contract"
	domain:          "region-objective-ranking"
}

#RegistryArtifactDescriptorContractRegistryDescriptorDataModel: #DataModel & {
	contractId:      "hobo.datamodel.registry-artifact-descriptor-contract.registry-descriptor"
	protobufMessage: "RegistryArtifactDescriptorContractRegistryDescriptorDataModel"
	sourcePath:      "src/draft/registry-artifact-descriptor-contract/src/registry-descriptor.ts"
	packageName:     "registry-artifact-descriptor-contract"
	domain:          "registry-artifact-descriptor"
}

#RegistryCompromiseGuardContractRegistryCompromiseGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.registry-compromise-guard-contract.registry-compromise-guard"
	protobufMessage: "RegistryCompromiseGuardContractRegistryCompromiseGuardDataModel"
	sourcePath:      "src/draft/registry-compromise-guard-contract/src/registry-compromise-guard.ts"
	packageName:     "registry-compromise-guard-contract"
	domain:          "registry-compromise-guard"
}

#RegistryDependencyConfusionGuardContractRegistryDependencyConfusionGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.registry-dependency-confusion-guard-contract.registry-dependency-confusion-guard"
	protobufMessage: "RegistryDependencyConfusionGuardContractRegistryDependencyConfusionGuardDataModel"
	sourcePath:      "src/draft/registry-dependency-confusion-guard-contract/src/registry-dependency-confusion-guard.ts"
	packageName:     "registry-dependency-confusion-guard-contract"
	domain:          "registry-dependency-confusion-guard"
}

#RegistryImportContractRegistryImportDataModel: #DataModel & {
	contractId:      "hobo.datamodel.registry-import-contract.registry-import"
	protobufMessage: "RegistryImportContractRegistryImportDataModel"
	sourcePath:      "src/draft/registry-import-contract/src/registry-import.ts"
	packageName:     "registry-import-contract"
	domain:          "registry-import"
}

#RegistryPublishFlowContractRegistryPublishFlowDataModel: #DataModel & {
	contractId:      "hobo.datamodel.registry-publish-flow-contract.registry-publish-flow"
	protobufMessage: "RegistryPublishFlowContractRegistryPublishFlowDataModel"
	sourcePath:      "src/draft/registry-publish-flow-contract/src/registry-publish-flow.ts"
	packageName:     "registry-publish-flow-contract"
	domain:          "registry-publish-flow"
}

#RelationalProjectionSinkContractRelationalProjectionSinkDataModel: #DataModel & {
	contractId:      "hobo.datamodel.relational-projection-sink-contract.relational-projection-sink"
	protobufMessage: "RelationalProjectionSinkContractRelationalProjectionSinkDataModel"
	sourcePath:      "src/draft/relational-projection-sink-contract/src/relational-projection-sink.ts"
	packageName:     "relational-projection-sink-contract"
	domain:          "relational-projection-sink"
}

#ReliabilitySlaRollupContractReliabilitySlaRollupDataModel: #DataModel & {
	contractId:      "hobo.datamodel.reliability-sla-rollup-contract.reliability-sla-rollup"
	protobufMessage: "ReliabilitySlaRollupContractReliabilitySlaRollupDataModel"
	sourcePath:      "src/draft/reliability-sla-rollup-contract/src/reliability-sla-rollup.ts"
	packageName:     "reliability-sla-rollup-contract"
	domain:          "reliability-sla-rollup"
}

#RemediationSafetyGateContractRemediationSafetyGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.remediation-safety-gate-contract.remediation-safety-gate"
	protobufMessage: "RemediationSafetyGateContractRemediationSafetyGateDataModel"
	sourcePath:      "src/draft/remediation-safety-gate-contract/src/remediation-safety-gate.ts"
	packageName:     "remediation-safety-gate-contract"
	domain:          "remediation-safety-gate"
}

#ReplayLiveEquivalencePocEquivalenceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.replay-live-equivalence-poc.equivalence"
	protobufMessage: "ReplayLiveEquivalencePocEquivalenceDataModel"
	sourcePath:      "src/draft/replay-live-equivalence-poc/src/equivalence.ts"
	packageName:     "replay-live-equivalence-poc"
	domain:          "replay-live-equivalence"
}

#RepoViewEscapeHatchesContractRepoViewEscapeHatchesDataModel: #DataModel & {
	contractId:      "hobo.datamodel.repo-view-escape-hatches-contract.repo-view-escape-hatches"
	protobufMessage: "RepoViewEscapeHatchesContractRepoViewEscapeHatchesDataModel"
	sourcePath:      "src/draft/repo-view-escape-hatches-contract/src/repo-view-escape-hatches.ts"
	packageName:     "repo-view-escape-hatches-contract"
	domain:          "repo-view-escape-hatches"
}

#ResourceCollectionEngineContractResourceCollectionEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.resource-collection-engine-contract.resource-collection-engine"
	protobufMessage: "ResourceCollectionEngineContractResourceCollectionEngineDataModel"
	sourcePath:      "src/draft/resource-collection-engine-contract/src/resource-collection-engine.ts"
	packageName:     "resource-collection-engine-contract"
	domain:          "resource-collection-engine"
}

#ResourceDefinitionDriverContractResourceDefinitionDriverContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.resource-definition-driver-contract.resource-definition-driver-contract"
	protobufMessage: "ResourceDefinitionDriverContractResourceDefinitionDriverContractDataModel"
	sourcePath:      "src/draft/resource-definition-driver-contract/src/resource-definition-driver-contract.ts"
	packageName:     "resource-definition-driver-contract"
	domain:          "resource-definition-driver"
}

#ResourcePackDistributionContractResourcePackDistributionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.resource-pack-distribution-contract.resource-pack-distribution"
	protobufMessage: "ResourcePackDistributionContractResourcePackDistributionDataModel"
	sourcePath:      "src/draft/resource-pack-distribution-contract/src/resource-pack-distribution.ts"
	packageName:     "resource-pack-distribution-contract"
	domain:          "resource-pack-distribution"
}

#ResourceactorFsmContractResourceactorFsmContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.resourceactor-fsm-contract.resourceactor-fsm-contract"
	protobufMessage: "ResourceactorFsmContractResourceactorFsmContractDataModel"
	sourcePath:      "src/draft/resourceactor-fsm-contract/src/resourceactor-fsm-contract.ts"
	packageName:     "resourceactor-fsm-contract"
	domain:          "resourceactor-fsm"
}

#ResourceactorReconcileLoopContractResourceactorReconcileLoopDataModel: #DataModel & {
	contractId:      "hobo.datamodel.resourceactor-reconcile-loop-contract.resourceactor-reconcile-loop"
	protobufMessage: "ResourceactorReconcileLoopContractResourceactorReconcileLoopDataModel"
	sourcePath:      "src/draft/resourceactor-reconcile-loop-contract/src/resourceactor-reconcile-loop.ts"
	packageName:     "resourceactor-reconcile-loop-contract"
	domain:          "resourceactor-reconcile-loop"
}

#RollbackFailureCompensationContractRollbackFailureCompensationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.rollback-failure-compensation-contract.rollback-failure-compensation"
	protobufMessage: "RollbackFailureCompensationContractRollbackFailureCompensationDataModel"
	sourcePath:      "src/draft/rollback-failure-compensation-contract/src/rollback-failure-compensation.ts"
	packageName:     "rollback-failure-compensation-contract"
	domain:          "rollback-failure-compensation"
}

#RunInspectorProjectionContractRunInspectorDataModel: #DataModel & {
	contractId:      "hobo.datamodel.run-inspector-projection-contract.run-inspector"
	protobufMessage: "RunInspectorProjectionContractRunInspectorDataModel"
	sourcePath:      "src/draft/run-inspector-projection-contract/src/run-inspector.ts"
	packageName:     "run-inspector-projection-contract"
	domain:          "run-inspector-projection"
}

#RunawayRemediationGuardContractRunawayRemediationGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.runaway-remediation-guard-contract.runaway-remediation-guard"
	protobufMessage: "RunawayRemediationGuardContractRunawayRemediationGuardDataModel"
	sourcePath:      "src/draft/runaway-remediation-guard-contract/src/runaway-remediation-guard.ts"
	packageName:     "runaway-remediation-guard-contract"
	domain:          "runaway-remediation-guard"
}

#RunawaySpendCircuitBreakerContractRunawaySpendCircuitBreakerDataModel: #DataModel & {
	contractId:      "hobo.datamodel.runaway-spend-circuit-breaker-contract.runaway-spend-circuit-breaker"
	protobufMessage: "RunawaySpendCircuitBreakerContractRunawaySpendCircuitBreakerDataModel"
	sourcePath:      "src/draft/runaway-spend-circuit-breaker-contract/src/runaway-spend-circuit-breaker.ts"
	packageName:     "runaway-spend-circuit-breaker-contract"
	domain:          "runaway-spend-circuit-breaker"
}

#RunbookContractRunbookContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.runbook-contract.runbook-contract"
	protobufMessage: "RunbookContractRunbookContractDataModel"
	sourcePath:      "src/draft/runbook-contract/src/runbook-contract.ts"
	packageName:     "runbook-contract"
	domain:          "runbook"
}

#RunbookExecutionEngineContractRunbookExecutionEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.runbook-execution-engine-contract.runbook-execution-engine"
	protobufMessage: "RunbookExecutionEngineContractRunbookExecutionEngineDataModel"
	sourcePath:      "src/draft/runbook-execution-engine-contract/src/runbook-execution-engine.ts"
	packageName:     "runbook-execution-engine-contract"
	domain:          "runbook-execution-engine"
}

#RuntimeLocalComponentHostComponentHostDataModel: #DataModel & {
	contractId:      "hobo.datamodel.runtime-local-component-host.component-host"
	protobufMessage: "RuntimeLocalComponentHostComponentHostDataModel"
	sourcePath:      "src/draft/runtime-local-component-host/src/component-host.ts"
	packageName:     "runtime-local-component-host"
	domain:          "runtime-local-component-host"
}

#RuntimeLocalExecutionLimitsContractExecutionLimitsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.runtime-local-execution-limits-contract.execution-limits"
	protobufMessage: "RuntimeLocalExecutionLimitsContractExecutionLimitsDataModel"
	sourcePath:      "src/draft/runtime-local-execution-limits-contract/src/execution-limits.ts"
	packageName:     "runtime-local-execution-limits-contract"
	domain:          "runtime-local-execution-limits"
}

#RuntimePortConformanceContractRuntimePortConformanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.runtime-port-conformance-contract.runtime-port-conformance"
	protobufMessage: "RuntimePortConformanceContractRuntimePortConformanceDataModel"
	sourcePath:      "src/draft/runtime-port-conformance-contract/src/runtime-port-conformance.ts"
	packageName:     "runtime-port-conformance-contract"
	domain:          "runtime-port-conformance"
}

#SagaCompensationEngineContractSagaCompensationEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.saga-compensation-engine-contract.saga-compensation-engine"
	protobufMessage: "SagaCompensationEngineContractSagaCompensationEngineDataModel"
	sourcePath:      "src/draft/saga-compensation-engine-contract/src/saga-compensation-engine.ts"
	packageName:     "saga-compensation-engine-contract"
	domain:          "saga-compensation-engine"
}

#SagaCreditReconciliationSpikeSpikeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.saga-credit-reconciliation-spike.spike"
	protobufMessage: "SagaCreditReconciliationSpikeSpikeDataModel"
	sourcePath:      "src/draft/saga-credit-reconciliation-spike/src/spike.ts"
	packageName:     "saga-credit-reconciliation-spike"
	domain:          "saga-credit-reconciliation"
}

#SdkCodegenSurfaceContractSdkCodegenSurfaceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.sdk-codegen-surface-contract.sdk-codegen-surface"
	protobufMessage: "SdkCodegenSurfaceContractSdkCodegenSurfaceDataModel"
	sourcePath:      "src/draft/sdk-codegen-surface-contract/src/sdk-codegen-surface.ts"
	packageName:     "sdk-codegen-surface-contract"
	domain:          "sdk-codegen-surface"
}

#SdkFlagSurfaceContractSdkFlagSurfaceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.sdk-flag-surface-contract.sdk-flag-surface"
	protobufMessage: "SdkFlagSurfaceContractSdkFlagSurfaceDataModel"
	sourcePath:      "src/draft/sdk-flag-surface-contract/src/sdk-flag-surface.ts"
	packageName:     "sdk-flag-surface-contract"
	domain:          "sdk-flag-surface"
}

#SdkIdiomConformanceGateSdkConformanceGateDataModel: #DataModel & {
	contractId:      "hobo.datamodel.sdk-idiom-conformance-gate.sdk-conformance-gate"
	protobufMessage: "SdkIdiomConformanceGateSdkConformanceGateDataModel"
	sourcePath:      "src/draft/sdk-idiom-conformance-gate/src/sdk-conformance-gate.ts"
	packageName:     "sdk-idiom-conformance-gate"
	domain:          "sdk-idiom-conformance-gate"
}

#SearchExtensionPackagesContractSearchExtensionPackagesDataModel: #DataModel & {
	contractId:      "hobo.datamodel.search-extension-packages-contract.search-extension-packages"
	protobufMessage: "SearchExtensionPackagesContractSearchExtensionPackagesDataModel"
	sourcePath:      "src/draft/search-extension-packages-contract/src/search-extension-packages.ts"
	packageName:     "search-extension-packages-contract"
	domain:          "search-extension-packages"
}

#SecopsPolicyAuditJourneyContractSecopsPolicyAuditJourneyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.secops-policy-audit-journey-contract.secops-policy-audit-journey"
	protobufMessage: "SecopsPolicyAuditJourneyContractSecopsPolicyAuditJourneyDataModel"
	sourcePath:      "src/draft/secops-policy-audit-journey-contract/src/secops-policy-audit-journey.ts"
	packageName:     "secops-policy-audit-journey-contract"
	domain:          "secops-policy-audit-journey"
}

#SecretZeroGenesisBootstrapContractGenesisBootstrapTrustDataModel: #DataModel & {
	contractId:      "hobo.datamodel.secret-zero-genesis-bootstrap-contract.genesis-bootstrap-trust"
	protobufMessage: "SecretZeroGenesisBootstrapContractGenesisBootstrapTrustDataModel"
	sourcePath:      "src/draft/secret-zero-genesis-bootstrap-contract/src/genesis-bootstrap-trust.ts"
	packageName:     "secret-zero-genesis-bootstrap-contract"
	domain:          "secret-zero-genesis-bootstrap"
}

#SecretlessConfigResolutionContractSecretlessConfigResolutionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.secretless-config-resolution-contract.secretless-config-resolution"
	protobufMessage: "SecretlessConfigResolutionContractSecretlessConfigResolutionDataModel"
	sourcePath:      "src/draft/secretless-config-resolution-contract/src/secretless-config-resolution.ts"
	packageName:     "secretless-config-resolution-contract"
	domain:          "secretless-config-resolution"
}

#SelfHostBootstrapOrderingSpikeBootstrapOrderingDataModel: #DataModel & {
	contractId:      "hobo.datamodel.self-host-bootstrap-ordering-spike.bootstrap-ordering"
	protobufMessage: "SelfHostBootstrapOrderingSpikeBootstrapOrderingDataModel"
	sourcePath:      "src/draft/self-host-bootstrap-ordering-spike/src/bootstrap-ordering.ts"
	packageName:     "self-host-bootstrap-ordering-spike"
	domain:          "self-host-bootstrap-ordering"
}

#SelfHostBootstrapSagaContractSelfHostBootstrapSagaDataModel: #DataModel & {
	contractId:      "hobo.datamodel.self-host-bootstrap-saga-contract.self-host-bootstrap-saga"
	protobufMessage: "SelfHostBootstrapSagaContractSelfHostBootstrapSagaDataModel"
	sourcePath:      "src/draft/self-host-bootstrap-saga-contract/src/self-host-bootstrap-saga.ts"
	packageName:     "self-host-bootstrap-saga-contract"
	domain:          "self-host-bootstrap-saga"
}

#SessionRevocationContractSessionRevocationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.session-revocation-contract.session-revocation"
	protobufMessage: "SessionRevocationContractSessionRevocationDataModel"
	sourcePath:      "src/draft/session-revocation-contract/src/session-revocation.ts"
	packageName:     "session-revocation-contract"
	domain:          "session-revocation"
}

#SharedCostAttributionContractSharedCostAttributionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.shared-cost-attribution-contract.shared-cost-attribution"
	protobufMessage: "SharedCostAttributionContractSharedCostAttributionDataModel"
	sourcePath:      "src/draft/shared-cost-attribution-contract/src/shared-cost-attribution.ts"
	packageName:     "shared-cost-attribution-contract"
	domain:          "shared-cost-attribution"
}

#ShowbackAttributionContractShowbackAttributionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.showback-attribution-contract.showback-attribution"
	protobufMessage: "ShowbackAttributionContractShowbackAttributionDataModel"
	sourcePath:      "src/draft/showback-attribution-contract/src/showback-attribution.ts"
	packageName:     "showback-attribution-contract"
	domain:          "showback-attribution"
}

#SignedArtifactPublishInstallContractPublishInstallContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.signed-artifact-publish-install-contract.publish-install-contract"
	protobufMessage: "SignedArtifactPublishInstallContractPublishInstallContractDataModel"
	sourcePath:      "src/draft/signed-artifact-publish-install-contract/src/publish-install-contract.ts"
	packageName:     "signed-artifact-publish-install-contract"
	domain:          "signed-artifact-publish-install"
}

#SignedOfflineBundleContractBundleContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.signed-offline-bundle-contract.bundle-contract"
	protobufMessage: "SignedOfflineBundleContractBundleContractDataModel"
	sourcePath:      "src/draft/signed-offline-bundle-contract/src/bundle-contract.ts"
	packageName:     "signed-offline-bundle-contract"
	domain:          "signed-offline-bundle"
}

#SloAsCodeContractSloContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.slo-as-code-contract.slo-contract"
	protobufMessage: "SloAsCodeContractSloContractDataModel"
	sourcePath:      "src/draft/slo-as-code-contract/src/slo-contract.ts"
	packageName:     "slo-as-code-contract"
	domain:          "slo-as-code"
}

#SloComputationEngineContractSloComputationEngineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.slo-computation-engine-contract.slo-computation-engine"
	protobufMessage: "SloComputationEngineContractSloComputationEngineDataModel"
	sourcePath:      "src/draft/slo-computation-engine-contract/src/slo-computation-engine.ts"
	packageName:     "slo-computation-engine-contract"
	domain:          "slo-computation-engine"
}

#SloGamingGuardContractSloGamingGuardContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.slo-gaming-guard-contract.slo-gaming-guard-contract"
	protobufMessage: "SloGamingGuardContractSloGamingGuardContractDataModel"
	sourcePath:      "src/draft/slo-gaming-guard-contract/src/slo-gaming-guard-contract.ts"
	packageName:     "slo-gaming-guard-contract"
	domain:          "slo-gaming-guard"
}

#SloGatedRollbackAnalysisContractSloGatedRollbackAnalysisDataModel: #DataModel & {
	contractId:      "hobo.datamodel.slo-gated-rollback-analysis-contract.slo-gated-rollback-analysis"
	protobufMessage: "SloGatedRollbackAnalysisContractSloGatedRollbackAnalysisDataModel"
	sourcePath:      "src/draft/slo-gated-rollback-analysis-contract/src/slo-gated-rollback-analysis.ts"
	packageName:     "slo-gated-rollback-analysis-contract"
	domain:          "slo-gated-rollback-analysis"
}

#SloPromotionGateContractSloPromotionGateContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.slo-promotion-gate-contract.slo-promotion-gate-contract"
	protobufMessage: "SloPromotionGateContractSloPromotionGateContractDataModel"
	sourcePath:      "src/draft/slo-promotion-gate-contract/src/slo-promotion-gate-contract.ts"
	packageName:     "slo-promotion-gate-contract"
	domain:          "slo-promotion-gate"
}

#SloRollbackDecisionCorrectnessSpikeReplayCorpusDataModel: #DataModel & {
	contractId:      "hobo.datamodel.slo-rollback-decision-correctness-spike.replay-corpus"
	protobufMessage: "SloRollbackDecisionCorrectnessSpikeReplayCorpusDataModel"
	sourcePath:      "src/draft/slo-rollback-decision-correctness-spike/src/replay-corpus.ts"
	packageName:     "slo-rollback-decision-correctness-spike"
	domain:          "slo-rollback-decision-correctness"
}

#SlsaProvenanceCertificationContractProvenanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.slsa-provenance-certification-contract.provenance"
	protobufMessage: "SlsaProvenanceCertificationContractProvenanceDataModel"
	sourcePath:      "src/draft/slsa-provenance-certification-contract/src/provenance.ts"
	packageName:     "slsa-provenance-certification-contract"
	domain:          "slsa-provenance-certification"
}

#SnapshotCompactionContractSnapshotCompactionContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.snapshot-compaction-contract.snapshot-compaction-contract"
	protobufMessage: "SnapshotCompactionContractSnapshotCompactionContractDataModel"
	sourcePath:      "src/draft/snapshot-compaction-contract/src/snapshot-compaction-contract.ts"
	packageName:     "snapshot-compaction-contract"
	domain:          "snapshot-compaction"
}

#SnapshotReplayDivergenceContractSnapshotReplayDivergenceContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.snapshot-replay-divergence-contract.snapshot-replay-divergence-contract"
	protobufMessage: "SnapshotReplayDivergenceContractSnapshotReplayDivergenceContractDataModel"
	sourcePath:      "src/draft/snapshot-replay-divergence-contract/src/snapshot-replay-divergence-contract.ts"
	packageName:     "snapshot-replay-divergence-contract"
	domain:          "snapshot-replay-divergence"
}

#SplitHorizonPartitionConnectivityContractSplitHorizonPartitionConnectivityDataModel: #DataModel & {
	contractId:      "hobo.datamodel.split-horizon-partition-connectivity-contract.split-horizon-partition-connectivity"
	protobufMessage: "SplitHorizonPartitionConnectivityContractSplitHorizonPartitionConnectivityDataModel"
	sourcePath:      "src/draft/split-horizon-partition-connectivity-contract/src/split-horizon-partition-connectivity.ts"
	packageName:     "split-horizon-partition-connectivity-contract"
	domain:          "split-horizon-partition-connectivity"
}

#SreDecisionTreeContractSreDecisionTreeDataModel: #DataModel & {
	contractId:      "hobo.datamodel.sre-decision-tree-contract.sre-decision-tree"
	protobufMessage: "SreDecisionTreeContractSreDecisionTreeDataModel"
	sourcePath:      "src/draft/sre-decision-tree-contract/src/sre-decision-tree.ts"
	packageName:     "sre-decision-tree-contract"
	domain:          "sre-decision-tree"
}

#SreDiagnoseProjectionContractSreDiagnoseProjectionDataModel: #DataModel & {
	contractId:      "hobo.datamodel.sre-diagnose-projection-contract.sre-diagnose-projection"
	protobufMessage: "SreDiagnoseProjectionContractSreDiagnoseProjectionDataModel"
	sourcePath:      "src/draft/sre-diagnose-projection-contract/src/sre-diagnose-projection.ts"
	packageName:     "sre-diagnose-projection-contract"
	domain:          "sre-diagnose-projection"
}

#SreDriftRemediationJourneyContractSreDriftRemediationJourneyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.sre-drift-remediation-journey-contract.sre-drift-remediation-journey"
	protobufMessage: "SreDriftRemediationJourneyContractSreDriftRemediationJourneyDataModel"
	sourcePath:      "src/draft/sre-drift-remediation-journey-contract/src/sre-drift-remediation-journey.ts"
	packageName:     "sre-drift-remediation-journey-contract"
	domain:          "sre-drift-remediation-journey"
}

#SreMttdMttrPostmortemContractSreMttdMttrPostmortemDataModel: #DataModel & {
	contractId:      "hobo.datamodel.sre-mttd-mttr-postmortem-contract.sre-mttd-mttr-postmortem"
	protobufMessage: "SreMttdMttrPostmortemContractSreMttdMttrPostmortemDataModel"
	sourcePath:      "src/draft/sre-mttd-mttr-postmortem-contract/src/sre-mttd-mttr-postmortem.ts"
	packageName:     "sre-mttd-mttr-postmortem-contract"
	domain:          "sre-mttd-mttr-postmortem"
}

#SreOperatorSkeletonContractSreOperatorSkeletonDataModel: #DataModel & {
	contractId:      "hobo.datamodel.sre-operator-skeleton-contract.sre-operator-skeleton"
	protobufMessage: "SreOperatorSkeletonContractSreOperatorSkeletonDataModel"
	sourcePath:      "src/draft/sre-operator-skeleton-contract/src/sre-operator-skeleton.ts"
	packageName:     "sre-operator-skeleton-contract"
	domain:          "sre-operator-skeleton"
}

#StaticKeyEscapeHatchContractStaticKeyEscapeHatchDataModel: #DataModel & {
	contractId:      "hobo.datamodel.static-key-escape-hatch-contract.static-key-escape-hatch"
	protobufMessage: "StaticKeyEscapeHatchContractStaticKeyEscapeHatchDataModel"
	sourcePath:      "src/draft/static-key-escape-hatch-contract/src/static-key-escape-hatch.ts"
	packageName:     "static-key-escape-hatch-contract"
	domain:          "static-key-escape-hatch"
}

#StreamerRuntimePortContractStreamerRuntimePortDataModel: #DataModel & {
	contractId:      "hobo.datamodel.streamer-runtime-port-contract.streamer-runtime-port"
	protobufMessage: "StreamerRuntimePortContractStreamerRuntimePortDataModel"
	sourcePath:      "src/draft/streamer-runtime-port-contract/src/streamer-runtime-port.ts"
	packageName:     "streamer-runtime-port-contract"
	domain:          "streamer-runtime-port"
}

#StructuredLogPipelineContractStructuredLogPipelineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.structured-log-pipeline-contract.structured-log-pipeline"
	protobufMessage: "StructuredLogPipelineContractStructuredLogPipelineDataModel"
	sourcePath:      "src/draft/structured-log-pipeline-contract/src/structured-log-pipeline.ts"
	packageName:     "structured-log-pipeline-contract"
	domain:          "structured-log-pipeline"
}

#StuckRolloutConvergenceContractStuckRolloutConvergenceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.stuck-rollout-convergence-contract.stuck-rollout-convergence"
	protobufMessage: "StuckRolloutConvergenceContractStuckRolloutConvergenceDataModel"
	sourcePath:      "src/draft/stuck-rollout-convergence-contract/src/stuck-rollout-convergence.ts"
	packageName:     "stuck-rollout-convergence-contract"
	domain:          "stuck-rollout-convergence"
}

#SvidAutoRotationContractSvidRotationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.svid-auto-rotation-contract.svid-rotation"
	protobufMessage: "SvidAutoRotationContractSvidRotationDataModel"
	sourcePath:      "src/draft/svid-auto-rotation-contract/src/svid-rotation.ts"
	packageName:     "svid-auto-rotation-contract"
	domain:          "svid-auto-rotation"
}

#SvidCrossTenantGuardContractSvidCrossTenantGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.svid-cross-tenant-guard-contract.svid-cross-tenant-guard"
	protobufMessage: "SvidCrossTenantGuardContractSvidCrossTenantGuardDataModel"
	sourcePath:      "src/draft/svid-cross-tenant-guard-contract/src/svid-cross-tenant-guard.ts"
	packageName:     "svid-cross-tenant-guard-contract"
	domain:          "svid-cross-tenant-guard"
}

#SvidPartitionGraceSpikePartitionGraceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.svid-partition-grace-spike.partition-grace"
	protobufMessage: "SvidPartitionGraceSpikePartitionGraceDataModel"
	sourcePath:      "src/draft/svid-partition-grace-spike/src/partition-grace.ts"
	packageName:     "svid-partition-grace-spike"
	domain:          "svid-partition-grace"
}

#SystemFailureClassifierContractClassifierDataModel: #DataModel & {
	contractId:      "hobo.datamodel.system-failure-classifier-contract.classifier"
	protobufMessage: "SystemFailureClassifierContractClassifierDataModel"
	sourcePath:      "src/draft/system-failure-classifier-contract/src/classifier.ts"
	packageName:     "system-failure-classifier-contract"
	domain:          "system-failure-classifier"
}

#TelemetryEnvelopeContractTelemetryEnvelopeContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.telemetry-envelope-contract.telemetry-envelope-contract"
	protobufMessage: "TelemetryEnvelopeContractTelemetryEnvelopeContractDataModel"
	sourcePath:      "src/draft/telemetry-envelope-contract/src/telemetry-envelope-contract.ts"
	packageName:     "telemetry-envelope-contract"
	domain:          "telemetry-envelope"
}

#TenantDataLifecycleContractTenantDataLifecycleDataModel: #DataModel & {
	contractId:      "hobo.datamodel.tenant-data-lifecycle-contract.tenant-data-lifecycle"
	protobufMessage: "TenantDataLifecycleContractTenantDataLifecycleDataModel"
	sourcePath:      "src/draft/tenant-data-lifecycle-contract/src/tenant-data-lifecycle.ts"
	packageName:     "tenant-data-lifecycle-contract"
	domain:          "tenant-data-lifecycle"
}

#TierFivePublicMtlsContractTierFivePublicMtlsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.tier-five-public-mtls-contract.tier-five-public-mtls"
	protobufMessage: "TierFivePublicMtlsContractTierFivePublicMtlsDataModel"
	sourcePath:      "src/draft/tier-five-public-mtls-contract/src/tier-five-public-mtls.ts"
	packageName:     "tier-five-public-mtls-contract"
	domain:          "tier-five-public-mtls"
}

#TierFourOverlayMeshContractTierFourOverlayMeshDataModel: #DataModel & {
	contractId:      "hobo.datamodel.tier-four-overlay-mesh-contract.tier-four-overlay-mesh"
	protobufMessage: "TierFourOverlayMeshContractTierFourOverlayMeshDataModel"
	sourcePath:      "src/draft/tier-four-overlay-mesh-contract/src/tier-four-overlay-mesh.ts"
	packageName:     "tier-four-overlay-mesh-contract"
	domain:          "tier-four-overlay-mesh"
}

#TierOnePrivateNetworkContractTierOnePrivateNetworkDataModel: #DataModel & {
	contractId:      "hobo.datamodel.tier-one-private-network-contract.tier-one-private-network"
	protobufMessage: "TierOnePrivateNetworkContractTierOnePrivateNetworkDataModel"
	sourcePath:      "src/draft/tier-one-private-network-contract/src/tier-one-private-network.ts"
	packageName:     "tier-one-private-network-contract"
	domain:          "tier-one-private-network"
}

#TierThreePrivateInterconnectContractTierThreePrivateInterconnectDataModel: #DataModel & {
	contractId:      "hobo.datamodel.tier-three-private-interconnect-contract.tier-three-private-interconnect"
	protobufMessage: "TierThreePrivateInterconnectContractTierThreePrivateInterconnectDataModel"
	sourcePath:      "src/draft/tier-three-private-interconnect-contract/src/tier-three-private-interconnect.ts"
	packageName:     "tier-three-private-interconnect-contract"
	domain:          "tier-three-private-interconnect"
}

#TierTwoCrossRegionNetworkContractTierTwoCrossRegionNetworkDataModel: #DataModel & {
	contractId:      "hobo.datamodel.tier-two-cross-region-network-contract.tier-two-cross-region-network"
	protobufMessage: "TierTwoCrossRegionNetworkContractTierTwoCrossRegionNetworkDataModel"
	sourcePath:      "src/draft/tier-two-cross-region-network-contract/src/tier-two-cross-region-network.ts"
	packageName:     "tier-two-cross-region-network-contract"
	domain:          "tier-two-cross-region-network"
}

#TokenBrokerHaCacheContractTokenBrokerHaCacheDataModel: #DataModel & {
	contractId:      "hobo.datamodel.token-broker-ha-cache-contract.token-broker-ha-cache"
	protobufMessage: "TokenBrokerHaCacheContractTokenBrokerHaCacheDataModel"
	sourcePath:      "src/draft/token-broker-ha-cache-contract/src/token-broker-ha-cache.ts"
	packageName:     "token-broker-ha-cache-contract"
	domain:          "token-broker-ha-cache"
}

#TokenBrokerSkeletonContractTokenBrokerSkeletonDataModel: #DataModel & {
	contractId:      "hobo.datamodel.token-broker-skeleton-contract.token-broker-skeleton"
	protobufMessage: "TokenBrokerSkeletonContractTokenBrokerSkeletonDataModel"
	sourcePath:      "src/draft/token-broker-skeleton-contract/src/token-broker-skeleton.ts"
	packageName:     "token-broker-skeleton-contract"
	domain:          "token-broker-skeleton"
}

#TokenReplayResistanceContractTokenReplayResistanceDataModel: #DataModel & {
	contractId:      "hobo.datamodel.token-replay-resistance-contract.token-replay-resistance"
	protobufMessage: "TokenReplayResistanceContractTokenReplayResistanceDataModel"
	sourcePath:      "src/draft/token-replay-resistance-contract/src/token-replay-resistance.ts"
	packageName:     "token-replay-resistance-contract"
	domain:          "token-replay-resistance"
}

#TopologyObjectsContractTopologyObjectsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.topology-objects-contract.topology-objects"
	protobufMessage: "TopologyObjectsContractTopologyObjectsDataModel"
	sourcePath:      "src/draft/topology-objects-contract/src/topology-objects.ts"
	packageName:     "topology-objects-contract"
	domain:          "topology-objects"
}

#TopologyOverrideConflictContractTopologyOverrideConflictDataModel: #DataModel & {
	contractId:      "hobo.datamodel.topology-override-conflict-contract.topology-override-conflict"
	protobufMessage: "TopologyOverrideConflictContractTopologyOverrideConflictDataModel"
	sourcePath:      "src/draft/topology-override-conflict-contract/src/topology-override-conflict.ts"
	packageName:     "topology-override-conflict-contract"
	domain:          "topology-override-conflict"
}

#TraceContextPropagationContractTraceContextPropagationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.trace-context-propagation-contract.trace-context-propagation"
	protobufMessage: "TraceContextPropagationContractTraceContextPropagationDataModel"
	sourcePath:      "src/draft/trace-context-propagation-contract/src/trace-context-propagation.ts"
	packageName:     "trace-context-propagation-contract"
	domain:          "trace-context-propagation"
}

#TrainingDataPoisoningGuardContractTrainingDataPoisoningGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.training-data-poisoning-guard-contract.training-data-poisoning-guard"
	protobufMessage: "TrainingDataPoisoningGuardContractTrainingDataPoisoningGuardDataModel"
	sourcePath:      "src/draft/training-data-poisoning-guard-contract/src/training-data-poisoning-guard.ts"
	packageName:     "training-data-poisoning-guard-contract"
	domain:          "training-data-poisoning-guard"
}

#TrainingEnginePortContractTrainingEngineContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.training-engine-port-contract.training-engine-contract"
	protobufMessage: "TrainingEnginePortContractTrainingEngineContractDataModel"
	sourcePath:      "src/draft/training-engine-port-contract/src/training-engine-contract.ts"
	packageName:     "training-engine-port-contract"
	domain:          "training-engine-port"
}

#TrustTierPolicyContractTrustTierPolicyDataModel: #DataModel & {
	contractId:      "hobo.datamodel.trust-tier-policy-contract.trust-tier-policy"
	protobufMessage: "TrustTierPolicyContractTrustTierPolicyDataModel"
	sourcePath:      "src/draft/trust-tier-policy-contract/src/trust-tier-policy.ts"
	packageName:     "trust-tier-policy-contract"
	domain:          "trust-tier-policy"
}

#UsageInferredPermissionsContractUsagePermissionsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.usage-inferred-permissions-contract.usage-permissions"
	protobufMessage: "UsageInferredPermissionsContractUsagePermissionsDataModel"
	sourcePath:      "src/draft/usage-inferred-permissions-contract/src/usage-permissions.ts"
	packageName:     "usage-inferred-permissions-contract"
	domain:          "usage-inferred-permissions"
}

#V1CutlineContractV1CutlineDataModel: #DataModel & {
	contractId:      "hobo.datamodel.v1-cutline-contract.v1-cutline"
	protobufMessage: "V1CutlineContractV1CutlineDataModel"
	sourcePath:      "src/draft/v1-cutline-contract/src/v1-cutline.ts"
	packageName:     "v1-cutline-contract"
	domain:          "v1-cutline"
}

#V1ReleaseNotesUpgradeGuideContractReleaseNotesUpgradeGuideDataModel: #DataModel & {
	contractId:      "hobo.datamodel.v1-release-notes-upgrade-guide-contract.release-notes-upgrade-guide"
	protobufMessage: "V1ReleaseNotesUpgradeGuideContractReleaseNotesUpgradeGuideDataModel"
	sourcePath:      "src/draft/v1-release-notes-upgrade-guide-contract/src/release-notes-upgrade-guide.ts"
	packageName:     "v1-release-notes-upgrade-guide-contract"
	domain:          "v1-release-notes-upgrade-guide"
}

#VersionCompatResolutionSemanticsResolutionSemanticsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.version-compat-resolution-semantics.resolution-semantics"
	protobufMessage: "VersionCompatResolutionSemanticsResolutionSemanticsDataModel"
	sourcePath:      "src/draft/version-compat-resolution-semantics/src/resolution-semantics.ts"
	packageName:     "version-compat-resolution-semantics"
	domain:          "version-compat-resolution-semantics"
}

#VersionPinningDriftGuardContractVersionPinningDriftGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.version-pinning-drift-guard-contract.version-pinning-drift-guard"
	protobufMessage: "VersionPinningDriftGuardContractVersionPinningDriftGuardDataModel"
	sourcePath:      "src/draft/version-pinning-drift-guard-contract/src/version-pinning-drift-guard.ts"
	packageName:     "version-pinning-drift-guard-contract"
	domain:          "version-pinning-drift-guard"
}

#VmMicrovmBuildProvidersContractVmMicrovmBuildProvidersDataModel: #DataModel & {
	contractId:      "hobo.datamodel.vm-microvm-build-providers-contract.vm-microvm-build-providers"
	protobufMessage: "VmMicrovmBuildProvidersContractVmMicrovmBuildProvidersDataModel"
	sourcePath:      "src/draft/vm-microvm-build-providers-contract/src/vm-microvm-build-providers.ts"
	packageName:     "vm-microvm-build-providers-contract"
	domain:          "vm-microvm-build-providers"
}

#VscodeExtensionContractVscodeExtensionContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.vscode-extension-contract.vscode-extension-contract"
	protobufMessage: "VscodeExtensionContractVscodeExtensionContractDataModel"
	sourcePath:      "src/draft/vscode-extension-contract/src/vscode-extension-contract.ts"
	packageName:     "vscode-extension-contract"
	domain:          "vscode-extension"
}

#WasiInterfacePinsWasiPinsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.wasi-interface-pins.wasi-pins"
	protobufMessage: "WasiInterfacePinsWasiPinsDataModel"
	sourcePath:      "src/draft/wasi-interface-pins/src/wasi-pins.ts"
	packageName:     "wasi-interface-pins"
	domain:          "wasi-interface-pins"
}

#WebsocketPreviewWitContractWebsocketPreviewContractDataModel: #DataModel & {
	contractId:      "hobo.datamodel.websocket-preview-wit-contract.websocket-preview-contract"
	protobufMessage: "WebsocketPreviewWitContractWebsocketPreviewContractDataModel"
	sourcePath:      "src/draft/websocket-preview-wit-contract/src/websocket-preview-contract.ts"
	packageName:     "websocket-preview-wit-contract"
	domain:          "websocket-preview-wit"
}

#WebsocketStreamerFanoutContractWebsocketStreamerFanoutDataModel: #DataModel & {
	contractId:      "hobo.datamodel.websocket-streamer-fanout-contract.websocket-streamer-fanout"
	protobufMessage: "WebsocketStreamerFanoutContractWebsocketStreamerFanoutDataModel"
	sourcePath:      "src/draft/websocket-streamer-fanout-contract/src/websocket-streamer-fanout.ts"
	packageName:     "websocket-streamer-fanout-contract"
	domain:          "websocket-streamer-fanout"
}

#WireVersionNegotiationContractWireVersionNegotiationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.wire-version-negotiation-contract.wire-version-negotiation"
	protobufMessage: "WireVersionNegotiationContractWireVersionNegotiationDataModel"
	sourcePath:      "src/draft/wire-version-negotiation-contract/src/wire-version-negotiation.ts"
	packageName:     "wire-version-negotiation-contract"
	domain:          "wire-version-negotiation"
}

#WorkloadAttestationIntakeContractWorkloadAttestationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.workload-attestation-intake-contract.workload-attestation"
	protobufMessage: "WorkloadAttestationIntakeContractWorkloadAttestationDataModel"
	sourcePath:      "src/draft/workload-attestation-intake-contract/src/workload-attestation.ts"
	packageName:     "workload-attestation-intake-contract"
	domain:          "workload-attestation-intake"
}

#WrpcDeadlinePropagationContractWrpcDeadlinePropagationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.wrpc-deadline-propagation-contract.wrpc-deadline-propagation"
	protobufMessage: "WrpcDeadlinePropagationContractWrpcDeadlinePropagationDataModel"
	sourcePath:      "src/draft/wrpc-deadline-propagation-contract/src/wrpc-deadline-propagation.ts"
	packageName:     "wrpc-deadline-propagation-contract"
	domain:          "wrpc-deadline-propagation"
}

#WrpcInProcessLinkContractWrpcInProcessLinkDataModel: #DataModel & {
	contractId:      "hobo.datamodel.wrpc-in-process-link-contract.wrpc-in-process-link"
	protobufMessage: "WrpcInProcessLinkContractWrpcInProcessLinkDataModel"
	sourcePath:      "src/draft/wrpc-in-process-link-contract/src/wrpc-in-process-link.ts"
	packageName:     "wrpc-in-process-link-contract"
	domain:          "wrpc-in-process-link"
}

#WrpcLatticeTransportContractWrpcLatticeTransportDataModel: #DataModel & {
	contractId:      "hobo.datamodel.wrpc-lattice-transport-contract.wrpc-lattice-transport"
	protobufMessage: "WrpcLatticeTransportContractWrpcLatticeTransportDataModel"
	sourcePath:      "src/draft/wrpc-lattice-transport-contract/src/wrpc-lattice-transport.ts"
	packageName:     "wrpc-lattice-transport-contract"
	domain:          "wrpc-lattice-transport"
}

#WrpcMembraneFailureContractWrpcMembraneFailureDataModel: #DataModel & {
	contractId:      "hobo.datamodel.wrpc-membrane-failure-contract.wrpc-membrane-failure"
	protobufMessage: "WrpcMembraneFailureContractWrpcMembraneFailureDataModel"
	sourcePath:      "src/draft/wrpc-membrane-failure-contract/src/wrpc-membrane-failure.ts"
	packageName:     "wrpc-membrane-failure-contract"
	domain:          "wrpc-membrane-failure"
}

#X509SvidMtlsContractX509SvidMtlsDataModel: #DataModel & {
	contractId:      "hobo.datamodel.x509-svid-mtls-contract.x509-svid-mtls"
	protobufMessage: "X509SvidMtlsContractX509SvidMtlsDataModel"
	sourcePath:      "src/draft/x509-svid-mtls-contract/src/x509-svid-mtls.ts"
	packageName:     "x509-svid-mtls-contract"
	domain:          "x509-svid-mtls"
}

#XaaConfusedDeputyGuardContractXaaConfusedDeputyGuardDataModel: #DataModel & {
	contractId:      "hobo.datamodel.xaa-confused-deputy-guard-contract.xaa-confused-deputy-guard"
	protobufMessage: "XaaConfusedDeputyGuardContractXaaConfusedDeputyGuardDataModel"
	sourcePath:      "src/draft/xaa-confused-deputy-guard-contract/src/xaa-confused-deputy-guard.ts"
	packageName:     "xaa-confused-deputy-guard-contract"
	domain:          "xaa-confused-deputy-guard"
}

#YardDomainValidationContractYardDomainValidationDataModel: #DataModel & {
	contractId:      "hobo.datamodel.yard-domain-validation-contract.yard-domain-validation"
	protobufMessage: "YardDomainValidationContractYardDomainValidationDataModel"
	sourcePath:      "src/draft/yard-domain-validation-contract/src/yard-domain-validation.ts"
	packageName:     "yard-domain-validation-contract"
	domain:          "yard-domain-validation"
}

#YardIdentityIssuerContractIssuerDataModel: #DataModel & {
	contractId:      "hobo.datamodel.yard-identity-issuer-contract.issuer"
	protobufMessage: "YardIdentityIssuerContractIssuerDataModel"
	sourcePath:      "src/draft/yard-identity-issuer-contract/src/issuer.ts"
	packageName:     "yard-identity-issuer-contract"
	domain:          "yard-identity-issuer"
}

#YardTopologyManifestContractYardTopologyManifestDataModel: #DataModel & {
	contractId:      "hobo.datamodel.yard-topology-manifest-contract.yard-topology-manifest"
	protobufMessage: "YardTopologyManifestContractYardTopologyManifestDataModel"
	sourcePath:      "src/draft/yard-topology-manifest-contract/src/yard-topology-manifest.ts"
	packageName:     "yard-topology-manifest-contract"
	domain:          "yard-topology-manifest"
}
