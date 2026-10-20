/**
 * Cloud Infrastructure TLS / SSL Dynamic Profile Loader.
 *
 * Implements code-splitting and asynchronous lazy-evaluation for cloud SSL certificates.
 * Offloads heavy cloud-specific dependencies (such as aws-ssl-profiles) out of standard
 * production dependencies into an optional peerDependencies tier, saving significant bundle
 * weight for bare-metal, containerized, and on-premise deployments.
 */

/**
 * Dynamically applies AWS RDS CA bundle TLS profiles if `useAwsRds` is enabled.
 * If the consumer enables `useAwsRds` without installing `aws-ssl-profiles`,
 * an actionable and friendly error is thrown.
 *
 * @param baseConfig - Database configuration options.
 * @returns Database configuration with AWS RDS SSL certificates attached, if requested.
 */
export async function applySecureSSLProfile<T extends Record<string, any>>(baseConfig: T): Promise<T> {
  if (baseConfig && (baseConfig as any).useAwsRds) {
    try {
      const awsProfiles: any = await import('aws-ssl-profiles');
      const sslProfile =
        typeof awsProfiles.getSSLProfile === 'function'
          ? awsProfiles.getSSLProfile('amazon-rds-ca-cert-bundle')
          : typeof awsProfiles.default?.getSSLProfile === 'function'
            ? awsProfiles.default.getSSLProfile('amazon-rds-ca-cert-bundle')
            : (awsProfiles.default || awsProfiles);

      return {
        ...baseConfig,
        ssl: sslProfile
      };
    } catch (_err) {
      throw new Error(
        'The "aws-ssl-profiles" package is required for AWS RDS TLS. Run: npm install aws-ssl-profiles'
      );
    }
  }
  return baseConfig;
}
