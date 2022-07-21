# s3push-to-wordpress

[[_TOC_]]

## Installation

**NOTE**: This setup was tested with Wordpress 6.0!

You need a wordpress server that is publically reachable, since we use cloud
services (AWS-Lambda) to connect to your wordpress server.

1. For testing, you should use a non-production instance of wordpress first

AWS-Lightsail offers a "one-click install" of a wordpress server suitable for testing.
 * general info: https://aws.amazon.com/de/lightsail/
 * if logged into your aws console, use https://lightsail.aws.amazon.com/

2. Install the `s3push-to-wordpress` plugin:

```
cd wordpress/plugins
scp -r s3push-to-wordpress user@mywordpresshost/path-to-wordpress/wp-content/plugins/
```

3. Activate `s3push-to-wordpress` plugin in wordpress-admin

[activate-plugin](res/activate-plugin.png)

**Note**: this plugin defines some custom categories (politik, wirschaft, sport, ...).

If that interferes with your setup, please comment it out:

```
// add_action('init', array( __CLASS__, 'insert_categories'));
```

4. Enable custom fields

Enable custom fields in `Edit -> Post -> Preferences -> Panels -> Additional (Custom Fields)`
https://themeisle.com/blog/custom-fields-in-wordpress/

[custom-fields-0](res/custom-fields-0.png)
[custom-fields-1](res/custom-fields-1.png)
[custom-fields-2](res/custom-fields-2.png)

## Installation of additional plugins

[All activated plugins](res/all-active-plugins.png)

### WP REST API - Filter parameter for posts endpoints

There are additional plugin required to activate the Wordpress Rest-API for
filtering and authenticated writes.

Please install and activate the plugin `WP REST API filter parameter` from
[Github](https://github.com/wp-api/rest-filter):

```
git clone https://github.com/WP-API/rest-filter.git
rm -rf rest-filter/.git
scp -r rest-filter user@mywordpresshost/path-to-wordpress/wp-content/plugins/
```

Please activate the plugin.

### Application Passwords

**NOTE**: Starting in Wordpress 5.6, this plugin is not necessary because
Application Passwords are included in Wordpress Core. So this section can be
skipped.

The plugin `Application Passwords` can be installed by using the search for
plugins in the WP-Admin [Plugin](https://de.wordpress.org/plugins/application-passwords/).

Please activate the plugin.

### Webserver Configuration

The webserver configuration must be edited to pass the authorization header.

Please follow this description:

1. Log into your wordpress host:

Check configuration:

```
ssh user@mywordpresshost -i <PUBLIC_SSH_KEY>

nano path-to-apache/conf/vhosts/htaccess/wordpress-htaccess.conf

# Add the following lines
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule .* - [E=REMOTE_USER:%{HTTP:Authorization}]
</IfModule>


# Restart webserver
sudo pathto/restartscript restart
```

## Add new user

**NOTE**: Please ensure that HTTPS is enabled on your server to use Application
Passwords.

Add a new user in the WP-Admin.

[add-user-0](res/add-user-0.png)
[add-user-1](res/add-user-1.png)

* Select user name - e.g. `dpa-importer`
* Select role: `Editor`
* Add new application password named "s3push-to-wordpress" for `dpa-importer` (at the end of user admin page)
* Keep displayed app password, it is needed in the next step

[add-application-pwd](res/add-application-pwd.png)

**NOTE**: Use Rest-API security
If you block access to wordpress Rest-API with some plugin, you have
to selectively allow access for the new user `dpa-importer`.

## Requirements

### NodeJS

Make sure that you have [Node.js](https://nodejs.org/en/download/) installed on your
system. Please use a version >=10.

```
node --version
v14.19.3
```

### How to install nodejs and yarn on debian

The most flexible way to get nodejs on debian is to use a light-weight installer
like `nvm`. Afterwards we use npm to install yarn.

```
sudo apt-get install curl

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash

source ~/.nvm/nvm.sh

nvm install --lts

npm install -g yarn

# Test it
node -v

yarn -v
```

### AWS Credentials

Configure your AWS credentials. You can find more information 
[here](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html):

If the file `~/.aws/credentials` is available, the required environment
variable can reference it in the shell:

```
export AWS_PROFILE=...
```

Or you can copy the AWS credentials after creating a user directly into the
shell and set the following environment variables:

```
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

## Setup s3push

Here you can find instructions for setting up an S3-Bucket in your own
AWS account for receiving messages via S3 push.

### Short instructions

```
cd s3-push

node --version   # please ensure node v14 is installed

npm install -g serverless  # please ensure that serverless framework is installed

yarn install

# please ensure aws-credentials are set to admin-user of your aws-account

nano serverless.yml  # please look for "CHANGE THIS" to change bucket names, prefix, Wordpress-configs

yarn run s3push-deploy

# please use the output for the next step
```

Go to the [Customer-Portal](https://api-portal.dpa-newslab.com), activate and
configure s3push with the given output (S3PushUrlPrefix, S3PushAccessKeyId, S3PushSecretAccessKey).

If the configuration was successful, the message delivery should start instantly.

You can use the following command to check for the logs of the lambda handler:

```
sls logs -t -f handler
```

Or watch your wordpress blog, new posts should start being created.


### Instructions

1. Customize the file `serverless.yml` in the editor:

Please select a name for the S3 bucket that does not yet exist and select a
proper name for the prefix_in and prefix_out. (IMPORTANT: no leading or trailing
slashes ("/") and lowercase only)

```
custom:
  # Please set bucket name and prefix
  s3_bucket_name: dpa-s3push-mycompany-com  # CHANGE THIS!
  s3_prefix: incoming  # CHANGE THIS!
```

2. Deploy to AWS with the helper script we created:

```
yarn install
yarn run s3push-deploy
```

3. If the installation was successful, the following output appears:

```
Stack Outputs
S3PushSecretAccessKey: xxxx
S3PushUrlPrefix: s3://<s3_bucket_name>/<s3_prefix>
S3PushAccessKeyId: AKIAIxxxxx
...
```

To set up the delivery, you can either contact your contact person
or go to the [Customer-Portal](https://api-portal.dpa-newslab.com), activate and
configure s3push with the given output (S3PushUrlPrefix, S3PushAccessKeyId, S3PushSecretAccessKey).

If the configuration was successful, the message delivery should start instantly.

You can use the following command to check for the logs of the lambda handler:

```
sls logs -t -f handler
```

Or watch your wordpress blog, new posts should start being created.

## Access to the data

To check whether data was delivered to your S3-Bucket use the following command:

```
aws s3 ls s3://<s3_bucket_name>/<s3_prefix> --recursive
```

## Deinstallation

Removing the packages via:

```
sls remove
```

and removal of the AWS S3-Bucket via:

```
aws s3 rm s3://<s3_bucket_name>/<s3_prefix> --recursive
```
