/* -*- coding: utf-8 -*-

 Copyright 2022 dpa-IT Services GmbH

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

const AWS_S3 = require('aws-sdk/clients/s3')
const WPAPI = require( 'wpapi' );
const path = require('path');
const fetch = require('node-fetch');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;


const Config = {
  // configured in serverless.yml
  wp_url:              process.env.wp_url,
  wp_username:         process.env.wp_username,
  wp_password:         process.env.wp_password,
  default_post_status: process.env.default_post_status,  // if not set, imported posts become drafts

  min_image_edgesize: 1000,

  terms: {
    dnltype_desk_to_category_slug: {
        'dpacat:pl': 'politik',
        'dpacat:wi': 'wirtschaft',
        'dpacat:ku': 'kultur',
        'dpacat:sp': 'sport',
        'dpacat:vm': 'vermischtes'
    },
    categories_by_slug: {}  // fetched dynamically
  }
}

const S3 = new AWS_S3({signatureVersion: 'v4'})

// lambda function
module.exports.handler = async (event, context, callback) => {
  // console.log('event: %j', event)
  let records = event.Records
  if (records.length === 0) return
  const rec = records[0]
  const body = JSON.parse(rec.body)
  records = body.Records ? body.Records : []
  try {
    records.forEach(async record => {
      const topicle = await fetch_topicle(record)
      await import_topicles([topicle])
    })
    callback(null)
  } catch (err) {
    console.log(err)
    callback(err)
  }
}

async function fetch_topicle(record) {
  const [bucket, key] = [record.s3.bucket.name, record.s3.object.key]
  console.log(`reading s3://${bucket}/${key}`)
  const data = await S3.getObject({Bucket:bucket, Key:key}).promise()
  const topicle = JSON.parse(data.Body.toString('utf-8'))
  return topicle
}

async function import_topicles(topicles) {
  try {
    // const site = await WPAPI.discover(Config.wp_url).then(site => site.auth({username: Config.username, password: Config.password}))
    const site = new WPAPI({
      endpoint: Config.wp_url,
      username: Config.wp_username,
      password: Config.wp_password,
      auth: true
    })

    // enable params
    site.filtered_posts = site.registerRoute('wp/v2', '/posts/(?P<id>)', { params: [ 'filter', 'status'] })
  
    // fetch term defs
    Config.terms.categories_by_slug = await site.categories().then(cats => cats.reduce((acc,cat) => { acc[cat.slug] = cat; return acc}, {}))
  
    for(const topicle of topicles) {
      // select existing post(s)
      const posts = await site.filtered_posts()
      .param('status', ['draft', 'publish', 'private'])
      .filter({meta_key: 'dw_urn', meta_value: topicle.urn})
      console.log(`found ${posts.length} existing posts for ${topicle.urn} posts ids ${posts.map(p=>p.id)}`)
  
      if (posts.length == 0) {
        if(topicle.pubstatus == "usable"){
          await create_post({site, topicle})
        }else{
          console.log(`topicle ${topicle.urn} has pubstatus ${topicle.pubstatus}. Skipping import.`)
        }
      } else {
        const existing_post = posts[0]
        switch(topicle.pubstatus){
          case "usable": 
            await update_post({site, existing_post, topicle})
          break;
          case "canceled": 
            await cancel_post({site, existing_post, topicle})
          break;
          default:
            console.warn(`Unknown pubstatus ${topicle.pubstatus}. Skipping import.`)
        } 
      }
    }
  } catch(e) {
    console.log(e)
  }
}

async function create_post({site, topicle}) {
  let post = await site.posts().create({
    ...make_post(topicle)
  })
  await add_featured_media({site, post, topicle})

  if (Config.default_post_status) {
    post = await site.posts().id(post.id).update({ status: Config.default_post_status })
  }
  console.log(`added post ${post.id} status ${post.status} for ${topicle.urn}/${topicle.version} ${topicle.version_created} ${topicle.headline}`)
}

async function update_post({site, existing_post, topicle}) {
  if (existing_post.meta.dw_version == topicle.version &&
    existing_post.meta.dw_version_created == topicle.version_created &&
    existing_post.meta.dw_updated == topicle.updated) {
    console.log(`no changes for post ${existing_post.id} topicle ${topicle.urn}/${topicle.version} ${topicle.version_created} ${topicle.headline}`)
    return
  }
  if (existing_post.meta.dw_version && topicle.version < existing_post.meta.dw_version) {
    console.log(`refusing to update existing post with topicle having smaller version: ${topicle.version} 
                 existing version: ${existing_post.meta.dw_version} post id: ${existing_post.id} ${topicle.urn}`)
    return
  }

    // update post
  const post = await site.posts().id(existing_post.id).update({
    ...make_post(topicle)
  })

  // update image
  await add_featured_media({site, post, topicle})
  console.log(`updated post ${post.id} from topicle ${topicle.urn}/${topicle.version} ${topicle.version_created} ${topicle.headline}`)
}

async function cancel_post({site, existing_post, topicle}) {
  const post = await site.posts().id(existing_post.id).update({
    title: topicle.headline,
    date: topicle.version_created,
    status: "private",
    meta: { dw_urn: topicle.urn,
      dw_version: topicle.version,
      dw_version_created: topicle.version_created,
            dw_updated: topicle.updated }
  })

  console.log(`canceled post ${post.id} from topicle ${topicle.urn}/${topicle.version} ${topicle.version_created} ${topicle.headline}`)
}

function make_post(topicle) {
  const post = {
    title: topicle.headline,
    date: topicle.version_created,
    content: get_article_html_with_dateline(topicle),
    excerpt: topicle.teaser ||'',
    meta: { dw_urn: topicle.urn,
      dw_version: topicle.version,
      dw_version_created: topicle.version_created,
            dw_updated: topicle.updated },
    categories: compute_post_categories(topicle).map(cat => cat.id )
  }

  return preprocess_post(topicle, post)
}

function get_article_html_with_dateline(topicle){
  if(!topicle.dateline) return topicle.article_html 

  try{
    const dom = new JSDOM(topicle.article_html)

    const firstP = dom.window.document.querySelector("p:first-child")
    firstP.innerHTML = `<span class=\"dateline\">${topicle.dateline}</span>${firstP.innerHTML}`

    const mainsection = dom.window.document.querySelector("section.main")
    if(mainsection){
      return mainsection.innerHTML
    }else{
      return dom.window.document.body.innerHTML
    }
  }catch(e){
    console.warn(`Adding dateline to article failed: ${e}`)
    return topicle.article_html
  }
}

function preprocess_post(topicle, post){
  //Use this function to customize the post-json
  return post
}

function compute_post_categories(topicle) {
  const qcodes = find_topicle_categories(topicle, 'dnltype:desk').map(cat => cat.qcode)
  const slugs = qcodes.map(qcode => Config.terms.dnltype_desk_to_category_slug[qcode])
  let categories = slugs.map(slug => Config.terms.categories_by_slug[slug])
  categories = categories.filter(cat => !!cat)
  return categories
}

function find_topicle_categories(topicle, type) {
  return topicle.categories.map(cat => cat.type == type ? cat : null).filter(cat => !!cat)
}

async function add_featured_media({site, post, topicle}) {
  if (!topicle.associations || topicle.associations.length == 0) {
    console.log(` no associations found in ${topicle.urn}/${topicle.version}`)
    return
  }
  
  const [topicle_image, rendition] = find_featured_image_and_rendition({topicle})
  if (topicle_image === null || rendition === null) {
    console.log(` no featured image found in ${topicle.urn}/${topicle.version}`)
    return
  }
  const topicle_image_url =  new URL(rendition.url)

  const num_images = topicle.associations.filter(assoc => assoc.type == 'image').length
  if (num_images > 1) {
    console.log(` skipping ${num_images - 1} additional images of ${topicle.urn}/${topicle.version} ${topicle.headline}`)
  }
  
  if (! await media_exists_and_is_current({site, post, topicle, topicle_image})) {
    console.log(` downloading image ${topicle_image_url}`)
    const image = await fetch(topicle_image_url.toString()).then(res => res.buffer())

    // create media from image
    const media = await site.media()
          .file(image, `${topicle.urn}/${path.basename(topicle_image_url.pathname)}`)
          .create({title: topicle_image.headline,
             caption: make_image_caption(topicle_image) })
    // add meta so we can decide if an update is necessary next time
    await site.media().id(media.id).update({
        meta: { dw_parent_urn: topicle.urn,
          dw_urn: topicle_image.urn,
          dw_version: topicle_image.version,
          dw_version_created: topicle_image.version_created }})
    // attach to post 
    await site.media().id(media.id).update({post: post.id})
    // make featured image
    await site.posts().id(post.id).update({featured_media: media.id})
    console.log(` added image ${media.id} ${topicle_image.urn}/${topicle_image.version} to post ${post.id}`)
  }
}

function make_image_caption(topicle_image) {
  let caption = topicle_image.caption || ''
  if (topicle_image.creditline) {
    caption += ` Foto: ${topicle_image.creditline}`
  }
  return caption
}

function find_featured_image_and_rendition({topicle, min_edge=Config.min_image_edgesize}) {
  for(const assoc of topicle.associations) {
    if (assoc.type == 'image' && assoc.is_featureimage) {
      for (const r of assoc.renditions) {
        if (r.size && r.size >= min_edge || r.width && r.width >= min_edge || r.height && r.height >= min_edge) {
          return [assoc, r]
        }
      }
    }
  }
  return [null, null]
}

async function media_exists_and_is_current({site, post, topicle, topicle_image}) {
  if (post.featured_media) {
    const media = await site.media().id(post.featured_media)
    if (media.post == post.id) {
      // we identify an versioned image as part of it's article parent
      if (media.meta.dw_parent_urn == topicle.urn &&
        media.meta.dw_urn == topicle_image.urn &&
        media.meta.dw_version == topicle_image.version &&
        media.meta.dw_version_created == topicle_image.version_created) {

        console.log(` image ${media.id} has not changed, keeping it`)
        return true
      } else {
      // only detach unused image, dont delete it
      await site.media().id(post.featured_media).update({post: null})
      console.log(` detached old image ${media.id}  ${media.meta.dw_urn}/${media.meta.dw_version} from post ${post.id} 
                               since we got an updated image ${topicle_image.urn}/${topicle_image.version}`)  
      return false 
      }
    }
  }
  return false
}
