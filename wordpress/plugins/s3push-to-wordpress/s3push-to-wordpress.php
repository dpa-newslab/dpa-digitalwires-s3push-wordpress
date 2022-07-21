<?php

/**  -*- coding: utf-8 -*-
*
* Copyright 2022 dpa-IT Services GmbH
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*    http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.

* Plugin Name: s3push-to-wordpress
* Description: Import dpa-articles using the s3push-api
* Version: 1.0.0
* Requires at least: 5.0
*/

add_filter( 'wp_is_application_passwords_available', '__return_true' );

if ( !class_exists( 'S3pushToWordpressPlugin' ) ) {

  class S3pushToWordpressPlugin {

    public static function init() {
      // add_filter( 'default_hidden_meta_boxes', array( __CLASS__, 'enable_custom_fields_per_default'), 20, 1 );
      add_action('rest_api_init', array( __CLASS__, 'register_meta_fields'));
      add_action('init', array( __CLASS__, 'insert_categories'));
			add_action('init', array( __CLASS__, 'allow_components'));
    }

    public static function register_meta_fields() {
      register_post_meta('post', 'dw_urn', [
        'type' => 'string',
        'description' => 'digitalwires urn',
        'single' => true,
        'show_in_rest' => true
      ]);

      register_post_meta('post', 'dw_version', [
        'type' => 'integer',
        'description' => 'digitalwires version',
        'single' => true,
        'show_in_rest' => true
      ]);

      register_post_meta('post', 'dw_version_created', [
        'type' => 'string',
        'description' => 'digitalwires version_created',
        'single' => true,
        'show_in_rest' => true
      ]);

      register_post_meta('post', 'dw_updated', [
        'type' => 'string',
        'description' => 'digitalwires updated',
        'single' => true,
        'show_in_rest' => true
      ]);

      register_post_meta('attachment', 'dw_parent_urn', [
        'type' => 'string',
        'description' => 'digitalwires urn',
        'single' => true,
        'show_in_rest' => true
      ]);

      register_post_meta('attachment', 'dw_urn', [
        'type' => 'string',
        'description' => 'digitalwires urn',
        'single' => true,
        'show_in_rest' => true
      ]);

      register_post_meta('attachment', 'dw_version', [
        'type' => 'integer',
        'description' => 'digitalwires version',
        'single' => true,
        'show_in_rest' => true
      ]);

      register_post_meta('attachment', 'dw_version_created', [
        'type' => 'string',
        'description' => 'digitalwires version_created',
        'single' => true,
        'show_in_rest' => true
      ]);
    }

    public static function insert_categories() {
      wp_insert_term('Politik', 'category', array(
        'description'  => 'Politik',
        'slug' => 'politik'
      ));
      wp_insert_term('Wirtschaft', 'category', array(
        'description'  => 'Wirtschaft',
        'slug' => 'wirtschaft'
      ));
      wp_insert_term('Kultur', 'category', array(
        'description'  => 'Kultur',
        'slug' => 'kultur'
      ));
      wp_insert_term('Sport', 'category', array(
        'description'  => 'Sport',
        'slug' => 'sport'
      ));
      wp_insert_term('Vermischtes', 'category', array(
        'description'  => 'Vermischtes',
        'slug' => 'vermischtes'
      ));
    }

    public static function allow_components(){
			global $allowedtags;
			$webcomponents = array("dnl-twitterembed", "dnl-youtubeembed", "dnl-dwchart", "dnl-wgchart");
			foreach($webcomponents as $component){
				$allowedtags[$component] = array('class'=>array());
			}
		}
  }
  S3pushToWordpressPlugin::init();
}
