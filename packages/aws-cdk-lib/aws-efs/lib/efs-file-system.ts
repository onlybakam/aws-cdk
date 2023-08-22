import { Construct, DependencyGroup, IDependable } from 'constructs';
import { AccessPoint, AccessPointOptions } from './access-point';
import { CfnFileSystem, CfnMountTarget } from './efs.generated';
import * as ec2 from '../../aws-ec2';
import * as iam from '../../aws-iam';
import * as kms from '../../aws-kms';
import { ArnFormat, FeatureFlags, Lazy, RemovalPolicy, Resource, Size, Stack, Tags } from '../../core';
import * as cxapi from '../../cx-api';

/**
 * EFS Lifecycle Policy, if a file is not accessed for given days, it will move to EFS Infrequent Access.
 *
 * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-efs-filesystem.html#cfn-elasticfilesystem-filesystem-lifecyclepolicies
 */
export enum LifecyclePolicy {

  /**
   * After 1 day of not being accessed.
   */
  AFTER_1_DAY = 'AFTER_1_DAY',

  /**
   * After 7 days of not being accessed.
   */
  AFTER_7_DAYS = 'AFTER_7_DAYS',

  /**
   * After 14 days of not being accessed.
   */
  AFTER_14_DAYS = 'AFTER_14_DAYS',

  /**
   * After 30 days of not being accessed.
   */
  AFTER_30_DAYS = 'AFTER_30_DAYS',

  /**
   * After 60 days of not being accessed.
   */
  AFTER_60_DAYS = 'AFTER_60_DAYS',

  /**
   * After 90 days of not being accessed.
   */
  AFTER_90_DAYS = 'AFTER_90_DAYS'
}

/**
 * EFS Out Of Infrequent Access Policy, if a file is accessed given times, it will move back to primary
 * storage class.
 *
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-efs-filesystem-lifecyclepolicy.html#cfn-efs-filesystem-lifecyclepolicy-transitiontoprimarystorageclass
 */
export enum OutOfInfrequentAccessPolicy {
  /**
   * After 1 access
   */
  AFTER_1_ACCESS = 'AFTER_1_ACCESS'
}

/**
 * EFS Performance mode.
 *
 * @see https://docs.aws.amazon.com/efs/latest/ug/performance.html#performancemodes
 */
export enum PerformanceMode {
  /**
   * General Purpose is ideal for latency-sensitive use cases, like web serving
   * environments, content management systems, home directories, and general file serving.
   * Recommended for the majority of Amazon EFS file systems.
   */
  GENERAL_PURPOSE = 'generalPurpose',

  /**
   * File systems in the Max I/O mode can scale to higher levels of aggregate
   * throughput and operations per second. This scaling is done with a tradeoff
   * of slightly higher latencies for file metadata operations.
   * Highly parallelized applications and workloads, such as big data analysis,
   * media processing, and genomics analysis, can benefit from this mode.
   */
  MAX_IO = 'maxIO'
}

/**
 * EFS Throughput mode.
 *
 * @see https://docs.aws.amazon.com/efs/latest/ug/performance.html#throughput-modes
 */
export enum ThroughputMode {
  /**
   * This mode scales as the size of the file system in the standard storage class grows.
   */
  BURSTING = 'bursting',

  /**
   * This mode can instantly provision the throughput of the file system (in MiB/s) independent of the amount of data stored.
   */
  PROVISIONED = 'provisioned',

  /**
  * This mode scales the throughput automatically regardless of file system size.
  */
  ELASTIC = 'elastic'
}

/**
 * Represents an Amazon EFS file system
 */
export interface IFileSystem extends ec2.IConnectable, iam.IResourceWithPolicy {
  /**
   * The ID of the file system, assigned by Amazon EFS.
   *
   * @attribute
   */
  readonly fileSystemId: string;

  /**
   * The ARN of the file system.
   *
   * @attribute
   */
  readonly fileSystemArn: string;

  /**
   * Dependable that can be depended upon to ensure the mount targets of the filesystem are ready
   */
  readonly mountTargetsAvailable: IDependable;

  /**
   * Grant the actions defined in actions to the given grantee
   * on this File System resource.
   */
  grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant;
}

/**
 * Properties of EFS FileSystem.
 */
export interface FileSystemProps {

  /**
   * VPC to launch the file system in.
   */
  readonly vpc: ec2.IVpc;

  /**
   * Security Group to assign to this file system.
   *
   * @default - creates new security group which allows all outbound traffic
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Which subnets to place the mount target in the VPC.
   *
   * @default - the Vpc default strategy if not specified
   */
  readonly vpcSubnets?: ec2.SubnetSelection;

  /**
   * Defines if the data at rest in the file system is encrypted or not.
   *
   * @default - If your application has the '@aws-cdk/aws-efs:defaultEncryptionAtRest' feature flag set, the default is true, otherwise, the default is false.
   * @link https://docs.aws.amazon.com/cdk/latest/guide/featureflags.html
   */
  readonly encrypted?: boolean;

  /**
   * The file system's name.
   *
   * @default - CDK generated name
   */
  readonly fileSystemName?: string;

  /**
   * The KMS key used for encryption. This is required to encrypt the data at rest if @encrypted is set to true.
   *
   * @default - if 'encrypted' is true, the default key for EFS (/aws/elasticfilesystem) is used
   */
  readonly kmsKey?: kms.IKey;

  /**
   * A policy used by EFS lifecycle management to transition files to the Infrequent Access (IA) storage class.
   *
   * @default - None. EFS will not transition files to the IA storage class.
   */
  readonly lifecyclePolicy?: LifecyclePolicy;

  /**
   * A policy used by EFS lifecycle management to transition files from Infrequent Access (IA) storage class to
   * primary storage class.
   *
   * @default - None. EFS will not transition files from IA storage to primary storage.
   */
  readonly outOfInfrequentAccessPolicy?: OutOfInfrequentAccessPolicy;
  /**
   * The performance mode that the file system will operate under.
   * An Amazon EFS file system's performance mode can't be changed after the file system has been created.
   * Updating this property will replace the file system.
   *
   * @default PerformanceMode.GENERAL_PURPOSE
   */
  readonly performanceMode?: PerformanceMode;

  /**
   * Enum to mention the throughput mode of the file system.
   *
   * @default ThroughputMode.BURSTING
   */
  readonly throughputMode?: ThroughputMode;

  /**
   * Provisioned throughput for the file system.
   * This is a required property if the throughput mode is set to PROVISIONED.
   * Must be at least 1MiB/s.
   *
   * @default - none, errors out
   */
  readonly provisionedThroughputPerSecond?: Size;

  /**
   * The removal policy to apply to the file system.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * Whether to enable automatic backups for the file system.
   *
   * @default false
   */
  readonly enableAutomaticBackups?: boolean;

  /**
   * File system policy is an IAM resource policy used to control NFS access to an EFS file system.
   *
   * @default none
   */
  readonly fileSystemPolicy?: iam.PolicyDocument;
}

/**
 * Properties that describe an existing EFS file system.
 */
export interface FileSystemAttributes {
  /**
   * The security group of the file system
   */
  readonly securityGroup: ec2.ISecurityGroup;

  /**
   * The File System's ID.
   *
   * @default - determined based on fileSystemArn
   */
  readonly fileSystemId?: string;

  /**
   * The File System's Arn.
   *
   * @default - determined based on fileSystemId
   */
  readonly fileSystemArn?: string;
}

abstract class FileSystemBase extends Resource implements IFileSystem {
  /**
   * The security groups/rules used to allow network connections to the file system.
   */
  public abstract readonly connections: ec2.Connections;

  /**
  * @attribute
  */
  public abstract readonly fileSystemId: string;
  /**
  * @attribute
  */
  public abstract readonly fileSystemArn: string;

  /**
   * Dependable that can be depended upon to ensure the mount targets of the filesystem are ready
   */
  public abstract readonly mountTargetsAvailable: IDependable;

  /**
   * @internal
   */
  protected _resource?: CfnFileSystem;
  /**
   * @internal
   */
  protected _fileSystemPolicy?: iam.PolicyDocument;

  /**
   * Grant the actions defined in actions to the given grantee
   * on this File System resource.
   *
   * @param grantee Principal to grant right to
   * @param actions The actions to grant
   */
  public grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee: grantee,
      actions: actions,
      resourceArns: [this.fileSystemArn],
    });
  }

  /**
   * Adds a statement to the resource policy associated with this file system.
   * A resource policy will be automatically created upon the first call to `addToResourcePolicy`.
   *
   * Note that this does not work with imported file systems.
   *
   * @param statement The policy statement to add
   */
  public addToResourcePolicy(
    statement: iam.PolicyStatement,
  ): iam.AddToResourcePolicyResult {
    if (!this._resource) {
      return { statementAdded: false };
    }
    this._fileSystemPolicy = this._fileSystemPolicy ?? new iam.PolicyDocument({ statements: [] });
    this._fileSystemPolicy.addStatements(statement);
    return {
      statementAdded: true,
      policyDependable: this,
    };
  }
}

/**
 * The Elastic File System implementation of IFileSystem.
 * It creates a new, empty file system in Amazon Elastic File System (Amazon EFS).
 * It also creates mount target (AWS::EFS::MountTarget) implicitly to mount the
 * EFS file system on an Amazon Elastic Compute Cloud (Amazon EC2) instance or another resource.
 *
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-efs-filesystem.html
 *
 * @resource AWS::EFS::FileSystem
 */
export class FileSystem extends FileSystemBase {
  /**
   * The default port File System listens on.
   */
  public static readonly DEFAULT_PORT: number = 2049;

  /**
   * Import an existing File System from the given properties.
   */
  public static fromFileSystemAttributes(scope: Construct, id: string, attrs: FileSystemAttributes): IFileSystem {
    return new ImportedFileSystem(scope, id, attrs);
  }

  /**
   * The security groups/rules used to allow network connections to the file system.
   */
  public readonly connections: ec2.Connections;

  /**
   * @attribute
   */
  public readonly fileSystemId: string;
  /**
   * @attribute
   */
  public readonly fileSystemArn: string;

  public readonly mountTargetsAvailable: IDependable;

  private readonly _mountTargetsAvailable = new DependencyGroup();

  /**
   * Constructor for creating a new EFS FileSystem.
   */
  constructor(scope: Construct, id: string, props: FileSystemProps) {
    super(scope, id);

    if (props.throughputMode === ThroughputMode.PROVISIONED && props.provisionedThroughputPerSecond === undefined) {
      throw new Error('Property provisionedThroughputPerSecond is required when throughputMode is PROVISIONED');
    }

    if (props.throughputMode === ThroughputMode.ELASTIC && props.performanceMode === PerformanceMode.MAX_IO) {
      throw new Error('ThroughputMode ELASTIC is not supported for file systems with performanceMode MAX_IO');
    }
    // we explictly use 'undefined' to represent 'false' to maintain backwards compatibility since
    // its considered an actual change in CloudFormations eyes, even though they have the same meaning.
    const encrypted = props.encrypted ?? (FeatureFlags.of(this).isEnabled(
      cxapi.EFS_DEFAULT_ENCRYPTION_AT_REST) ? true : undefined);

    // LifecyclePolicies is an array of lists containing a single policy
    let lifecyclePolicies = [];

    if (props.lifecyclePolicy) {
      lifecyclePolicies.push({ transitionToIa: props.lifecyclePolicy });
    }

    if (props.outOfInfrequentAccessPolicy) {
      lifecyclePolicies.push({ transitionToPrimaryStorageClass: props.outOfInfrequentAccessPolicy });
    }

    this._resource = new CfnFileSystem(this, 'Resource', {
      encrypted: encrypted,
      kmsKeyId: props.kmsKey?.keyArn,
      lifecyclePolicies: lifecyclePolicies.length > 0 ? lifecyclePolicies : undefined,
      performanceMode: props.performanceMode,
      throughputMode: props.throughputMode,
      provisionedThroughputInMibps: props.provisionedThroughputPerSecond?.toMebibytes(),
      backupPolicy: props.enableAutomaticBackups ? { status: 'ENABLED' } : undefined,
      fileSystemPolicy: Lazy.any({ produce: () => this._fileSystemPolicy }),
    });
    this._resource.applyRemovalPolicy(props.removalPolicy);

    this.fileSystemId = this._resource.ref;
    this.fileSystemArn = this._resource.attrArn;
    this._fileSystemPolicy = props.fileSystemPolicy;

    Tags.of(this).add('Name', props.fileSystemName || this.node.path);

    const securityGroup = (props.securityGroup || new ec2.SecurityGroup(this, 'EfsSecurityGroup', {
      vpc: props.vpc,
    }));

    this.connections = new ec2.Connections({
      securityGroups: [securityGroup],
      defaultPort: ec2.Port.tcp(FileSystem.DEFAULT_PORT),
    });

    const subnets = props.vpc.selectSubnets(props.vpcSubnets ?? { onePerAz: true });

    // We now have to create the mount target for each of the mentioned subnet

    // we explictly use FeatureFlags to maintain backwards compatibility
    const useMountTargetOrderInsensitiveLogicalID = FeatureFlags.of(this).isEnabled(cxapi.EFS_MOUNTTARGET_ORDERINSENSITIVE_LOGICAL_ID);
    this.mountTargetsAvailable = [];
    if (useMountTargetOrderInsensitiveLogicalID) {
      subnets.subnets.forEach((subnet) => {
        const mountTarget = new CfnMountTarget(this,
          `EfsMountTarget-${subnet.node.id}`,
          {
            fileSystemId: this.fileSystemId,
            securityGroups: Array.of(securityGroup.securityGroupId),
            subnetId: subnet.subnetId,
          });
        this._mountTargetsAvailable.add(mountTarget);
      });
    } else {
      let mountTargetCount = 0;
      subnets.subnetIds.forEach((subnetId: string) => {
        const mountTarget = new CfnMountTarget(this,
          'EfsMountTarget' + (++mountTargetCount),
          {
            fileSystemId: this.fileSystemId,
            securityGroups: Array.of(securityGroup.securityGroupId),
            subnetId,
          });
        this._mountTargetsAvailable.add(mountTarget);
      });
    }
    this.mountTargetsAvailable = this._mountTargetsAvailable;
  }

  /**
   * create access point from this filesystem
   */
  public addAccessPoint(id: string, accessPointOptions: AccessPointOptions = {}): AccessPoint {
    return new AccessPoint(this, id, {
      fileSystem: this,
      ...accessPointOptions,
    });
  }
}

class ImportedFileSystem extends FileSystemBase {
  /**
   * The security groups/rules used to allow network connections to the file system.
   */
  public readonly connections: ec2.Connections;

  /**
   * @attribute
   */
  public readonly fileSystemId: string;

  /**
   * @attribute
   */
  public readonly fileSystemArn: string;

  /**
   * Dependable that can be depended upon to ensure the mount targets of the filesystem are ready
   */
  public readonly mountTargetsAvailable: IDependable;

  constructor(scope: Construct, id: string, attrs: FileSystemAttributes) {
    super(scope, id);

    if (!!attrs.fileSystemId === !!attrs.fileSystemArn) {
      throw new Error('One of fileSystemId or fileSystemArn, but not both, must be provided.');
    }

    this.fileSystemArn = attrs.fileSystemArn ?? Stack.of(scope).formatArn({
      service: 'elasticfilesystem',
      resource: 'file-system',
      resourceName: attrs.fileSystemId,
    });

    const parsedArn = Stack.of(scope).splitArn(this.fileSystemArn, ArnFormat.SLASH_RESOURCE_NAME);

    if (!parsedArn.resourceName) {
      throw new Error(`Invalid FileSystem Arn ${this.fileSystemArn}`);
    }

    this.fileSystemId = attrs.fileSystemId ?? parsedArn.resourceName;

    this.connections = new ec2.Connections({
      securityGroups: [attrs.securityGroup],
      defaultPort: ec2.Port.tcp(FileSystem.DEFAULT_PORT),
    });

    this.mountTargetsAvailable = new DependencyGroup();
  }
}
