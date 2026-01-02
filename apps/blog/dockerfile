# 使用官方提供的 Nginx 镜像作为基础镜像，当前的镜像将基于 Nginx 镜像构建
FROM nginx
# 将本地文件复制到镜像中
COPY ./docs/.vitepress/dist /usr/share/nginx/html/
# 用于将本地的 ./blog.nginx.conf 文件复制到 Nginx 容器中的 /etc/nginx/conf.d/blog.nginx.conf 文件
COPY ./blog.nginx.conf /etc/nginx/conf.d/blog.nginx.conf
# 指定容器监听在 80 端口上，即对外提供 HTTP 服务
EXPOSE 80
